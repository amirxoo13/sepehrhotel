/**
 * Regression tests for the findings of the owner's third-party static audit
 * (2026-09-29). Each claim was checked against the code; the ones that held
 * are pinned here on the real schema in PGLite, the ones that did not are
 * documented in the test names with the code path that already covers them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { canTransitionRoom } from "./domain.ts";
import { bookRoomSql, checkInSql, checkOutSql } from "./statements.ts";

async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0001_auth.sql", "0002_hotel.sql", "0003_place.sql", "0004_owner_catalog.sql", "0005_audit_fixes.sql", "0006_rate_limit.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('guest-a', 'Guest A', 'a@example.com', true, now(), now())`,
  );
  return pg;
}

/** Books room 1 (the only sellable SINGLE) for tonight and checks the guest in. */
async function activeStay(pg: PGlite, today: string) {
  await pg.query(`update rooms set status = 'BLOCKED' where room_type_code = 'SINGLE' and number <> 1`);
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  const book = bookRoomSql({
    roomType: "SINGLE", userId: "guest-a", code: "SPBUG1", checkIn: today, checkOut: tomorrow, adults: 1, children: 0,
    guestName: "Guest A", guestPhone: null, notes: null, idempotencyKey: "idem-bug1", nights: [today], today, nightlyRate: 6_700_000, status: "CONFIRMED",
  });
  const res = (await pg.query<{ id: number; room_id: number }>(book.text, book.values)).rows[0];
  assert.ok(res, "booked");
  const ci = checkInSql({ reservationId: res.id, actorId: "staff-1", today });
  const stay = (await pg.query<{ stay_id: number }>(ci.text, ci.values)).rows[0];
  assert.ok(stay?.stay_id, "checked in");
  return { stayId: stay.stay_id, roomId: res.room_id };
}

// BUG-1 (confirmed): a room taken out of service during the stay lost that
// status at checkout — checkOutSql set CLEANING unconditionally.
test("BUG-1: a room put into MAINTENANCE during the stay stays in MAINTENANCE after checkout", async () => {
  const pg = await database();
  const { stayId, roomId } = await activeStay(pg, "2026-09-29");
  assert.equal(canTransitionRoom("OCCUPIED", "MAINTENANCE", true), true, "the domain allows this while a guest is in house");
  await pg.query(`update rooms set status = 'MAINTENANCE' where id = $1`, [roomId]);
  // The guest settles nothing: allowBalance covers the folio for this test.
  const co = checkOutSql({ stayId, actorId: "staff-1", allowBalance: true });
  const out = await pg.query(co.text, co.values);
  assert.equal(out.rows.length, 1, "checkout went through");
  const room = await pg.query<{ status: string }>(`select status from rooms where id = $1`, [roomId]);
  assert.equal(room.rows[0].status, "MAINTENANCE", "the maintenance flag survives the checkout");
  const task = await pg.query<{ n: number }>(`select count(*)::int as n from housekeeping_tasks where stay_id = $1 and kind = 'CHECKOUT_CLEAN'`, [stayId]);
  assert.equal(task.rows[0].n, 1, "housekeeping is still told to clean it");
});

test("BUG-1b: an ordinary occupied room goes to CLEANING at checkout, as before", async () => {
  const pg = await database();
  const { stayId, roomId } = await activeStay(pg, "2026-09-29");
  const co = checkOutSql({ stayId, actorId: "staff-1", allowBalance: true });
  await pg.query(co.text, co.values);
  const room = await pg.query<{ status: string }>(`select status from rooms where id = $1`, [roomId]);
  assert.equal(room.rows[0].status, "CLEANING");
});

// BUG-2 (not a bug): createReservation looks the idempotency key up before the
// insert and again when the insert hits the unique index (isUnique), so a
// retry returns the first reservation instead of failing.
test("BUG-2 is covered: createReservation resolves a repeated idempotency key before and after the insert", () => {
  const source = readFileSync(new URL("./service.server.ts", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("export async function createReservation"), source.indexOf("export async function myReservations"));
  assert.match(fn, /where user_id = \$\{userId\} and idempotency_key = \$\{key\}[\s\S]*if \(existing\[0\]\) return existing\[0\]/);
  assert.match(fn, /if \(!isUnique\(err\)\) throw err;[\s\S]*idempotency_key = \$\{key\}[\s\S]*if \(again\[0\]\) return again\[0\]/);
});

// SEC-1 (not a bug): the nightly rate is the room type's tariff from the
// database; neither the booking nor the extension API takes a rate from the client.
test("SEC-1 is covered: the client cannot set the nightly rate of a booking or an extension", () => {
  const service = readFileSync(new URL("./service.server.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  const create = service.slice(service.indexOf("export async function createReservation"), service.indexOf("export async function myReservations"));
  assert.match(create, /nightlyRate: type\.base_rate_toman/, "booking: tariff of the room type");
  const extend = service.slice(service.indexOf("export async function requestExtension"), service.indexOf("export async function requestExtension") + 4000);
  assert.match(extend, /nightlyRate: current\.nightly_rate_toman/, "extension: the reservation's own rate");
  const rateParams = [...api.matchAll(/nightlyRate: z\./g)].length;
  assert.equal(rateParams, 1, "only one endpoint accepts a rate: the staff confirmation");
  assert.match(api, /staffConfirm\(context\.userId, data\.reservationId, data\.nightlyRate\)/);
});
