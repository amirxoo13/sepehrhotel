import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { bookRoomSql, confirmReservationSql, placeOrderSql, releaseReservationSql, transitionOrderSql } from "./statements.ts";

/** The real schema: every migration, in order, exactly as deploy and dev apply them. */
async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0001_auth.sql", "0002_hotel.sql", "0003_place.sql", "0004_owner_catalog.sql", "0005_audit_fixes.sql", "0006_rate_limit.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('guest-a', 'Guest A', 'a@example.com', true, now(), now()),
            ('guest-b', 'Guest B', 'b@example.com', true, now(), now())`,
  );
  return pg;
}

function booking(userId: string, code: string, key: string, checkIn: string, checkOut: string, nights: string[], type = "SINGLE") {
  return bookRoomSql({
    roomType: type,
    userId,
    code,
    checkIn,
    checkOut,
    adults: 1,
    children: 0,
    guestName: `Guest ${userId}`,
    guestPhone: null,
    notes: null,
    idempotencyKey: key,
    nights,
    today: "2026-09-28",
    nightlyRate: 6_700_000,
    status: "CONFIRMED",
  });
}

test("one room cannot be sold twice for the same nights", async () => {
  const pg = await database();
  // SINGLE rooms are 1-6 (0004); block all but room 1.
  await pg.query(`update rooms set status = 'BLOCKED' where room_type_code = 'SINGLE' and number <> 1`);
  const first = booking("guest-a", "SPTEST01", "idem-a-1", "2026-10-10", "2026-10-12", ["2026-10-10", "2026-10-11"]);
  const a = await pg.query<{ id: number; room_number: number; night_count: number }>(first.text, first.values);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].room_number, 1);
  assert.equal(a.rows[0].night_count, 2);

  const second = booking("guest-b", "SPTEST02", "idem-b-1", "2026-10-11", "2026-10-13", ["2026-10-11", "2026-10-12"]);
  const b = await pg.query(second.text, second.values);
  assert.equal(b.rows.length, 0, "overlapping night on the only sellable single must not insert");

  await assert.rejects(
    pg.query(
      `insert into room_nights (room_id, night, reservation_id)
       select room_id, '2026-10-10', reservation_id from room_nights limit 1`,
    ),
    /duplicate key|unique/i,
  );
});

test("cancelling a reservation releases the nights", async () => {
  const pg = await database();
  const booked = booking("guest-a", "SPTEST03", "idem-a-2", "2026-11-01", "2026-11-03", ["2026-11-01", "2026-11-02"], "SMALL_SUITE");
  const row = await pg.query<{ id: number }>(booked.text, booked.values);
  const release = releaseReservationSql({ reservationId: row.rows[0].id, actorId: "guest-a", nextStatus: "CANCELLED", ownerOnly: true });
  const freed = await pg.query<{ released: number }>(release.text, release.values);
  assert.equal(freed.rows[0].released, 2);
  const again = booking("guest-b", "SPTEST04", "idem-b-2", "2026-11-01", "2026-11-03", ["2026-11-01", "2026-11-02"], "SMALL_SUITE");
  const next = await pg.query(again.text, again.values);
  assert.equal(next.rows.length, 1);
});

test("reception can correct the rate of a confirmed reservation until check-in", async () => {
  const pg = await database();
  const booked = booking("guest-a", "SPTEST05", "idem-a-3", "2026-11-05", "2026-11-07", ["2026-11-05", "2026-11-06"]);
  const row = await pg.query<{ id: number; status: string }>(booked.text, booked.values);
  assert.equal(row.rows[0].status, "CONFIRMED", "every type carries a tariff, so requests confirm at once");
  const fix = confirmReservationSql({ reservationId: row.rows[0].id, actorId: "staff-1", nightlyRate: 6_000_000 });
  assert.equal((await pg.query(fix.text, fix.values)).rows.length, 1, "a CONFIRMED reservation accepts a corrected rate");
  const rate = await pg.query<{ nightly_rate_toman: number }>(`select nightly_rate_toman from reservations where id = $1`, [row.rows[0].id]);
  assert.equal(Number(rate.rows[0].nightly_rate_toman), 6_000_000);
  await pg.query(`update reservations set status = 'CHECKED_IN' where id = $1`, [row.rows[0].id]);
  assert.equal((await pg.query(fix.text, fix.values)).rows.length, 0, "but not after check-in");
});

test("coffee is routed to the coffee shop and a cancelled order is not billed", async () => {
  const pg = await database();
  await pg.query(
    `insert into reservations (
       code, user_id, room_id, room_type_code, check_in, check_out, adults, children, status,
       nightly_rate_toman, guest_name, idempotency_key
     )
     select 'SPSTAY', 'guest-a', id, room_type_code, '2026-09-28', '2026-09-30', 1, 0, 'CHECKED_IN',
            1000, 'Guest A', 'idem-stay'
       from rooms where number = 23`,
  );
  await pg.query(
    `insert into stays (reservation_id, room_id, user_id, status, checked_in_at)
     select r.id, r.room_id, r.user_id, 'ACTIVE', now() from reservations r where r.code = 'SPSTAY'`,
  );
  await pg.query(`insert into folios (stay_id, reservation_id, user_id) select s.id, s.reservation_id, s.user_id from stays s`);
  const coffee = await pg.query<{ id: number }>(`select id from services where code = 'coffee'`);
  const stay = await pg.query<{ id: number }>(`select id from stays limit 1`);
  const base = {
    stayId: stay.rows[0].id,
    userId: "guest-a",
    quantity: 1,
    notes: null,
    priority: "NORMAL",
    serviceDate: null,
    serviceTime: null,
    guestCount: null,
    laundryLabel: null,
    plate: null,
    vehicleType: null,
    issueCode: null,
  };
  const order = placeOrderSql({ ...base, code: "SOCOFFEE", serviceId: coffee.rows[0].id, idempotencyKey: "idem-coffee" });
  const placed = await pg.query<{ department_code: string; id: number }>(order.text, order.values);
  assert.equal(placed.rows[0].department_code, "COFFEE_SHOP");

  const water = await pg.query<{ id: number }>(`select id from services where code = 'extra_water'`);
  const waterOrder = placeOrderSql({ ...base, code: "SOWATER", serviceId: water.rows[0].id, quantity: 2, idempotencyKey: "idem-water" });
  const waterRow = await pg.query<{ department_code: string }>(waterOrder.text, waterOrder.values);
  assert.equal(waterRow.rows[0].department_code, "HOUSEKEEPING");

  const wrongGuest = placeOrderSql({ ...base, code: "SOBAD", userId: "guest-b", serviceId: coffee.rows[0].id, idempotencyKey: "idem-bad" });
  const denied = await pg.query(wrongGuest.text, wrongGuest.values);
  assert.equal(denied.rows.length, 0);

  const cancel = transitionOrderSql({ orderId: placed.rows[0].id, actorId: "guest-a", from: "PENDING", to: "CANCELLED", department: null });
  await pg.query(cancel.text, cancel.values);
  const charges = await pg.query<{ n: number }>(`select count(*)::int as n from folio_items where source_type = 'SERVICE_ORDER'`);
  assert.equal(charges.rows[0].n, 0);
  const note = await pg.query<{ type: string }>(`select type from notifications where entity_type = 'order' and recipient_user_id = 'guest-a' order by id desc limit 1`);
  assert.equal(note.rows[0].type, "ORDER_CANCELLED", "the guest is told the order was cancelled, not accepted");

  await pg.query(`update stays set status = 'CLOSED'`);
  const after = placeOrderSql({ ...base, code: "SOAFTER", serviceId: coffee.rows[0].id, idempotencyKey: "idem-after" });
  const closed = await pg.query(after.text, after.values);
  assert.equal(closed.rows.length, 0);
});
