/**
 * Proof-of-concept tests for the priority-0 audit findings (service layer + SQL).
 *
 * Each test asserts the CORRECT behaviour, so it FAILS while the bug exists.
 * The database is the real schema: migrations 0001..0004 applied to PGLite,
 * exactly as `src/lib/db.ts` does in preview and `scripts/migrate.mjs` does on deploy.
 *
 * Where a service function cannot be imported here (service.server.ts imports
 * `@/lib/db`, an alias the bare node test runner cannot resolve), the SQL text is
 * copied verbatim from that file and the source line range is named.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { departmentScope, hasPermission } from "./domain.ts";
import {
  bookRoomSql,
  checkInSql,
  extendStaySql,
  placeOrderSql,
  transitionOrderSql,
} from "./statements.ts";

async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0001_auth.sql", "0002_hotel.sql", "0003_place.sql", "0004_owner_catalog.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('guest-a', 'Guest A', 'a@example.com', true, now(), now()),
            ('guest-b', 'Guest B', 'b@example.com', true, now(), now()),
            ('staff-1', 'Staff', 's@example.com', true, now(), now())`,
  );
  return pg;
}

function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (cursor < end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

async function book(
  pg: PGlite,
  input: { userId: string; type: string; checkIn: string; checkOut: string; rate: number; key: string; today: string },
) {
  const call = bookRoomSql({
    roomType: input.type,
    userId: input.userId,
    code: `SP${input.key}`,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: 1,
    children: 0,
    guestName: "Guest",
    guestPhone: null,
    notes: null,
    idempotencyKey: input.key,
    nights: nightsBetween(input.checkIn, input.checkOut),
    today: input.today,
    nightlyRate: input.rate,
    status: "CONFIRMED",
  });
  const rows = await pg.query<{ id: number; room_id: number }>(call.text, call.values);
  assert.equal(rows.rows.length, 1, "booking must insert");
  return rows.rows[0];
}

// ---------------------------------------------------------------------------
// Finding 1 — money columns are int4 (migrations/0002_hotel.sql):
//   folio_items.amount_toman int, payments.amount_toman int, reservations.nightly_rate_toman int
// checkInSql (statements.ts lines 216-284) charges nightly_rate_toman * nights.
// APT_DOUBLE is 11,800,000 toman/night (0004). createReservation allows up to
// 366 nights (service.server.ts line 296) — 11,800,000 × 200 = 2,360,000,000 > 2^31-1.
// ---------------------------------------------------------------------------
test("F1: check-in of a long stay at the owner tariff must not overflow the folio amount", async () => {
  const pg = await database();
  const today = "2026-10-01";
  const res = await book(pg, {
    userId: "guest-a",
    type: "APT_DOUBLE",
    checkIn: today,
    checkOut: "2027-04-19", // 200 nights
    rate: 11_800_000,
    key: "long-stay-1",
    today,
  });
  const call = checkInSql({ reservationId: res.id, actorId: "staff-1", today });
  // Correct behaviour: check-in succeeds and the folio carries 2,360,000,000.
  const rows = await pg.query<{ accommodation: number }>(call.text, call.values);
  assert.equal(rows.rows.length, 1);
  assert.equal(Number(rows.rows[0].accommodation), 2_360_000_000);
});

test("F1b: the operations board sum of open balances must not overflow int4", async () => {
  const pg = await database();
  const today = "2026-10-01";
  // Ten one-week stays at 11.8M/night = 82.6M each -> total 826M (fits); make it
  // overflow the way a full house does: 40 rooms × 7 nights × ~9M ≈ 2.5e9.
  const types = ["SINGLE", "SMALL_SUITE", "STANDARD_SUITE", "LARGE_SUITE_SINGLE", "APT_SINGLE", "LARGE_SUITE_DOUBLE", "APT_DOUBLE"];
  const perType: Record<string, number> = { SINGLE: 6, SMALL_SUITE: 6, STANDARD_SUITE: 6, LARGE_SUITE_SINGLE: 6, APT_SINGLE: 6, LARGE_SUITE_DOUBLE: 5, APT_DOUBLE: 5 };
  let n = 0;
  for (const type of types) {
    for (let i = 0; i < perType[type]; i += 1) {
      n += 1;
      const res = await book(pg, {
        userId: "guest-a",
        type,
        checkIn: today,
        checkOut: "2026-10-11", // 10 nights
        rate: 11_800_000,
        key: `full-${n}`,
        today,
      });
      const ci = checkInSql({ reservationId: res.id, actorId: "staff-1", today });
      const r = await pg.query(ci.text, ci.values);
      assert.equal(r.rows.length, 1, `check-in ${n}`);
    }
  }
  // Verbatim from service.server.ts opsSnapshot (lines 689-719), the `outstanding` column.
  const board = pg.query(`
      select (select coalesce(sum(b.balance),0)::int from (
            select
              coalesce((select sum(amount_toman) from folio_items fi where fi.folio_id = f.id and not fi.voided),0)
              - coalesce((select sum(amount_toman) from payments p where p.folio_id = f.id and p.status = 'RECORDED'),0)
              as balance
              from folios f where f.status = 'OPEN'
         ) b) as outstanding`);
  await assert.doesNotReject(board, "the ops board must render with a full house");
});

// ---------------------------------------------------------------------------
// Finding 2 — checkInSql never looks at the room: it requires only
// r.status = 'CONFIRMED' and r.check_in <= today (statements.ts lines 218-225).
// A room whose previous guest has not checked out yet (late checkout) or that
// staff put into MAINTENANCE can still receive a second ACTIVE stay.
// ---------------------------------------------------------------------------
test("F2: a room with an ACTIVE stay must not accept a second check-in", async () => {
  const pg = await database();
  // Guest A: 2026-10-01 -> 2026-10-03, checked in, NOT checked out on the 3rd.
  const a = await book(pg, { userId: "guest-a", type: "SINGLE", checkIn: "2026-10-01", checkOut: "2026-10-03", rate: 6_700_000, key: "a-1", today: "2026-10-01" });
  const ciA = checkInSql({ reservationId: a.id, actorId: "staff-1", today: "2026-10-01" });
  assert.equal((await pg.query(ciA.text, ciA.values)).rows.length, 1);
  // Guest B books the same room type from the 3rd (bookRoomSql picks the lowest
  // free room number — room 1 — because A's nights end on the 2nd).
  const b = await book(pg, { userId: "guest-b", type: "SINGLE", checkIn: "2026-10-03", checkOut: "2026-10-05", rate: 6_700_000, key: "b-1", today: "2026-10-01" });
  assert.equal(b.room_id, a.room_id, "B is assigned the room A still occupies");
  const ciB = checkInSql({ reservationId: b.id, actorId: "staff-1", today: "2026-10-03" });
  const rows = await pg.query(ciB.text, ciB.values);
  const active = await pg.query<{ n: number }>(
    `select count(*)::int as n from stays where room_id = $1 and status in ('ACTIVE','CHECKOUT_PENDING')`,
    [a.room_id],
  );
  assert.equal(rows.rows.length, 0, "check-in must be refused while the room is occupied");
  assert.equal(active.rows[0].n, 1, "exactly one active stay per room");
});

test("F2b: a room in MAINTENANCE must not accept a check-in", async () => {
  const pg = await database();
  const a = await book(pg, { userId: "guest-a", type: "SINGLE", checkIn: "2026-10-01", checkOut: "2026-10-03", rate: 6_700_000, key: "a-2", today: "2026-09-30" });
  // staffUpdateRoom (service.server.ts lines 841-882) does exactly this update.
  await pg.query(`update rooms set status = 'MAINTENANCE' where id = $1`, [a.room_id]);
  const ci = checkInSql({ reservationId: a.id, actorId: "staff-1", today: "2026-10-01" });
  const rows = await pg.query(ci.text, ci.values);
  assert.equal(rows.rows.length, 0, "check-in into a MAINTENANCE room must be refused");
});

// ---------------------------------------------------------------------------
// Finding 3 — permanent admin lock-out. claimAdmin (service.server.ts lines
// 260-291) requires hotel_settings.bootstrap_admin = '' AND no admin row.
// staffAssignRole (lines 1245-1276) lets the only HOTEL_ADMIN revoke their own
// role. Afterwards no admin exists and bootstrap_admin is non-empty: nobody can
// ever claim again.
// ---------------------------------------------------------------------------
const CLAIM_ADMIN_SQL = `
      with upd as (
        update hotel_settings
           set value = $1
         where key = 'bootstrap_admin'
           and value = ''
           and not exists (
             select 1 from user_roles where role_code in ('HOTEL_ADMIN','SUPER_ADMIN')
           )
        returning key
      ),
      role as (
        insert into user_roles (user_id, role_code)
        select $1, 'HOTEL_ADMIN' from upd
        on conflict do nothing
        returning user_id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $1, 'admin.claim', 'user', $1, jsonb_build_object('role','HOTEL_ADMIN')
          from role
        returning id
      )
      select user_id from role
    `;

test("F3: after the only admin revokes their own role, the hotel must not be locked out of administration", async () => {
  const pg = await database();
  const first = await pg.query(CLAIM_ADMIN_SQL, ["guest-a"]);
  assert.equal(first.rows.length, 1, "first claim succeeds");
  // Verbatim from staffAssignRole, grant = false branch (line 1265):
  await pg.query(`delete from user_roles where user_id = $1 and role_code = $2`, ["guest-a", "HOTEL_ADMIN"]);
  const admins = await pg.query<{ n: number }>(
    `select count(*)::int as n from user_roles where role_code in ('HOTEL_ADMIN','SUPER_ADMIN')`,
  );
  assert.equal(admins.rows[0].n, 0, "no admin is left");
  // Correct behaviour: with zero admins, a claim must succeed again (or the
  // revoke above must have been refused). Today the claim returns no row.
  const again = await pg.query(CLAIM_ADMIN_SQL, ["guest-b"]);
  assert.equal(again.rows.length, 1, "re-claim must be possible when no admin exists");
});

// ---------------------------------------------------------------------------
// Finding 4 — approving a SHORTER pending extension after a longer one was
// approved rewinds reservations.check_out. staffDecideExtension (service.server.ts
// lines 1115-1191): `res` sets check_out = requested_check_out unconditionally,
// while `nights` (generate_series from the CURRENT check_out) inserts nothing.
// ---------------------------------------------------------------------------
const DECIDE_EXTENSION_SQL = `
      with req as (
        select e.*, r.room_id, r.check_out, r.nightly_rate_toman, r.user_id, s.status as stay_status
          from extension_requests e
          join reservations r on r.id = e.reservation_id
          join stays s on s.id = e.stay_id
         where e.id = $1 and e.status = 'PENDING'
         for update
      ),
      conflict as (
        select 1
          from room_nights n, req
         where n.room_id = req.room_id
           and n.reservation_id <> req.reservation_id
           and n.night >= req.check_out
           and n.night < req.requested_check_out
      ),
      approved as (
        update extension_requests e
           set status = 'APPROVED', decided_by = $2
          from req
         where e.id = req.id
           and $3::boolean = true
           and not exists (select 1 from conflict)
           and req.nightly_rate_toman is not null
           and req.stay_status = 'ACTIVE'
        returning e.id, e.reservation_id, e.stay_id, e.requested_check_out, e.quoted_amount_toman
      ),
      res as (
        update reservations r
           set check_out = approved.requested_check_out, updated_at = now()
          from approved
         where r.id = approved.reservation_id
        returning r.room_id, r.id, r.check_out as old_out
      ),
      nights as (
        insert into room_nights (room_id, night, reservation_id)
        select req.room_id, d::date, req.reservation_id
          from req
          join approved on approved.id = req.id
          cross join generate_series(req.check_out, (approved.requested_check_out - interval '1 day')::date, interval '1 day') as d
        returning night
      ),
      charge as (
        insert into folio_items (folio_id, source_type, source_id, description_en, description_fa, amount_toman, quantity)
        select f.id, 'ROOM', 'ext-' || approved.id::text,
               'Stay extension to ' || approved.requested_check_out::text,
               'تمدید اقامت تا ' || approved.requested_check_out::text,
               coalesce(approved.quoted_amount_toman, 0),
               (select count(*) from nights)
          from approved
          join folios f on f.stay_id = approved.stay_id
         where exists (select 1 from nights)
        on conflict (source_type, source_id) do nothing
        returning id
      ),
      rejected as (
        update extension_requests e
           set status = 'REJECTED', decided_by = $2, reason = 'unavailable or declined'
          from req
         where e.id = req.id
           and not exists (select 1 from approved)
        returning e.id
      )
      select
        coalesce((select id from approved), (select id from rejected)) as id,
        case when exists (select 1 from approved) then 'APPROVED' else 'REJECTED' end as status
    `;

test("F4: approving an older, shorter extension must not rewind the check-out date", async () => {
  const pg = await database();
  const today = "2026-10-01";
  const res = await book(pg, { userId: "guest-a", type: "SINGLE", checkIn: today, checkOut: "2026-10-03", rate: 6_700_000, key: "ext-1", today });
  const ci = checkInSql({ reservationId: res.id, actorId: "staff-1", today });
  assert.equal((await pg.query(ci.text, ci.values)).rows.length, 1);
  const stay = (await pg.query<{ id: number }>(`select id from stays where reservation_id = $1`, [res.id])).rows[0];

  // Guest files two PENDING requests (extension_auto_approve is 'false' by seed).
  const longer = extendStaySql({ stayId: stay.id, actorId: "guest-a", requestedCheckOut: "2026-10-06", nights: nightsBetween("2026-10-03", "2026-10-06"), nightlyRate: 6_700_000, auto: false });
  const shorter = extendStaySql({ stayId: stay.id, actorId: "guest-a", requestedCheckOut: "2026-10-04", nights: nightsBetween("2026-10-03", "2026-10-04"), nightlyRate: 6_700_000, auto: false });
  const longId = (await pg.query<{ id: number; status: string }>(longer.text, longer.values)).rows[0];
  const shortId = (await pg.query<{ id: number; status: string }>(shorter.text, shorter.values)).rows[0];
  assert.equal(longId.status, "PENDING");
  assert.equal(shortId.status, "PENDING");

  // Reception approves the longer one first, then the shorter one.
  assert.equal((await pg.query<{ status: string }>(DECIDE_EXTENSION_SQL, [longId.id, "staff-1", true])).rows[0].status, "APPROVED");
  await pg.query(DECIDE_EXTENSION_SQL, [shortId.id, "staff-1", true]);

  const after = (await pg.query<{ check_out: string; nights: number; charged: number }>(
    `select r.check_out::text as check_out,
            (select count(*)::int from room_nights n where n.reservation_id = r.id) as nights,
            (select coalesce(sum(quantity),0)::int from folio_items fi join folios f on f.id = fi.folio_id where f.stay_id = $2 and fi.source_type = 'ROOM') as charged
       from reservations r where r.id = $1`,
    [res.id, stay.id],
  )).rows[0];
  // Correct: the reservation still ends on the 6th, holds 5 nights and is charged 5 nights.
  assert.equal(after.nights, 5);
  assert.equal(after.charged, 5);
  assert.equal(after.check_out, "2026-10-06", "check_out must not move backwards");
});

// ---------------------------------------------------------------------------
// Finding 5 — orders that no seeded role can finish (business dead ends).
//  a) 'wakeup' / 'taxi' / 'special_request' route to department RECEPTION
//     (service_categories FRONT -> RECEPTION, 0002 lines 549-557). staffTransition
//     (service.server.ts line 906-909) needs 'order.accept' for ACCEPTED.
//     RECEPTION is never granted order.accept (0002 lines 431-437).
//  b) 'extra_towels' is complimentary=false with price null (0002). HOUSEKEEPING
//     has no 'order.price' (0002 lines 438-440) so it can never price it, and
//     transitionOrderSql refuses DELIVERED for an unpriced non-complimentary item.
// ---------------------------------------------------------------------------
async function activeStay(pg: PGlite, userId: string, key: string) {
  const today = "2026-10-01";
  const res = await book(pg, { userId, type: "SINGLE", checkIn: today, checkOut: "2026-10-03", rate: 6_700_000, key, today });
  const ci = checkInSql({ reservationId: res.id, actorId: "staff-1", today });
  await pg.query(ci.text, ci.values);
  return (await pg.query<{ id: number }>(`select id from stays where reservation_id = $1`, [res.id])).rows[0].id;
}

async function permsOf(pg: PGlite, role: string): Promise<string[]> {
  return (await pg.query<{ permission_code: string }>(`select permission_code from role_permissions where role_code = $1`, [role])).rows.map((r) => r.permission_code);
}

test("F5a: the reception role must be able to accept a front-desk order routed to its own department", async () => {
  const pg = await database();
  const stayId = await activeStay(pg, "guest-a", "front-1");
  const wakeup = (await pg.query<{ id: number }>(`select id from services where code = 'wakeup'`)).rows[0];
  const order = placeOrderSql({ code: "SOWAKE", stayId, userId: "guest-a", serviceId: wakeup.id, quantity: 1, notes: "06:30", idempotencyKey: "wake-1", priority: "NORMAL", serviceDate: null, serviceTime: null, guestCount: null, laundryLabel: null, plate: null, vehicleType: null, issueCode: null });
  const placed = (await pg.query<{ department_code: string }>(order.text, order.values)).rows[0];
  assert.equal(placed.department_code, "RECEPTION");
  const reception = await permsOf(pg, "RECEPTION");
  assert.equal(departmentScope(["RECEPTION"]), null, "reception sees every queue");
  // staffTransition -> need(actor, "order.accept") for to === "ACCEPTED":
  assert.equal(hasPermission(reception, "order.accept"), true, "RECEPTION must hold order.accept for its own department's orders");
});

test("F5b: housekeeping must be able to deliver a priced-later housekeeping item", async () => {
  const pg = await database();
  const stayId = await activeStay(pg, "guest-a", "hk-1");
  const towels = (await pg.query<{ id: number; complimentary: boolean; price_toman: number | null }>(`select id, complimentary, price_toman from services where code = 'extra_towels'`)).rows[0];
  assert.equal(towels.complimentary, false);
  assert.equal(towels.price_toman, null);
  const order = placeOrderSql({ code: "SOTOWEL", stayId, userId: "guest-a", serviceId: towels.id, quantity: 1, notes: null, idempotencyKey: "towel-1", priority: "NORMAL", serviceDate: null, serviceTime: null, guestCount: null, laundryLabel: null, plate: null, vehicleType: null, issueCode: null });
  const placed = (await pg.query<{ id: number }>(order.text, order.values)).rows[0];
  const housekeeping = await permsOf(pg, "HOUSEKEEPING");
  // The department cannot price its own item …
  const canPrice = hasPermission(housekeeping, "order.price");
  // … and the delivery statement refuses an unpriced non-complimentary line.
  for (const [from, to] of [["PENDING", "ACCEPTED"], ["ACCEPTED", "PREPARING"], ["PREPARING", "READY"]] as const) {
    const t = transitionOrderSql({ orderId: placed.id, actorId: "staff-1", from, to, department: "HOUSEKEEPING" });
    assert.equal((await pg.query(t.text, t.values)).rows.length, 1, `${from} -> ${to}`);
  }
  const deliver = transitionOrderSql({ orderId: placed.id, actorId: "staff-1", from: "READY", to: "DELIVERED", department: "HOUSEKEEPING" });
  const delivered = (await pg.query(deliver.text, deliver.values)).rows.length === 1;
  assert.ok(canPrice || delivered, "housekeeping can neither price nor deliver 'extra_towels': the order is stuck at READY forever");
});

// ---------------------------------------------------------------------------
// Finding 6 — a guest who taps "request checkout" is frozen. requestCheckout
// (service.server.ts lines 572-604) moves stays to CHECKOUT_PENDING. No statement
// in service.server.ts or statements.ts ever sets a stay back to ACTIVE, while
// placeOrderSql and extendStaySql both require status = 'ACTIVE'.
// ---------------------------------------------------------------------------
const REQUEST_CHECKOUT_SQL = `
      with stay as (
        update stays
           set status = 'CHECKOUT_PENDING'
         where user_id = $1 and status = 'ACTIVE'
        returning id, room_id
      ),
      room as (
        update rooms rm
           set status = 'CHECKOUT_PENDING'
          from stay
         where rm.id = stay.room_id and rm.status = 'OCCUPIED'
        returning rm.id
      ),
      hist as (
        insert into room_status_history (room_id, from_status, to_status, actor_user_id, reason)
        select stay.room_id, 'OCCUPIED', 'CHECKOUT_PENDING', $1, 'guest checkout request'
          from stay
         where exists (select 1 from room)
        returning id
      ),
      note as (
        insert into notifications (recipient_role, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id)
        select 'RECEPTION', 'HOTEL_ANNOUNCEMENT', 'Checkout requested', 'درخواست خروج',
               'A guest asked to check out', 'مهمان درخواست خروج ثبت کرد', 'stay', stay.id::text
          from stay
        returning id
      )
      select id, room_id from stay
    `;

test("F6: a checkout request must be reversible; today the guest can no longer order or extend", async () => {
  const pg = await database();
  const stayId = await activeStay(pg, "guest-a", "co-1");
  assert.equal((await pg.query(REQUEST_CHECKOUT_SQL, ["guest-a"])).rows.length, 1);
  // Reception can move the ROOM back (canTransitionRoom CHECKOUT_PENDING -> OCCUPIED), but
  // nothing moves the STAY back. Prove the guest is stuck:
  const coffee = (await pg.query<{ id: number }>(`select id from services where code = 'coffee'`)).rows[0];
  const order = placeOrderSql({ code: "SOSTUCK", stayId, userId: "guest-a", serviceId: coffee.id, quantity: 1, notes: null, idempotencyKey: "stuck-1", priority: "NORMAL", serviceDate: null, serviceTime: null, guestCount: null, laundryLabel: null, plate: null, vehicleType: null, issueCode: null });
  const ext = extendStaySql({ stayId, actorId: "guest-a", requestedCheckOut: "2026-10-05", nights: nightsBetween("2026-10-03", "2026-10-05"), nightlyRate: 6_700_000, auto: false });
  const canOrder = (await pg.query(order.text, order.values)).rows.length === 1;
  const canExtend = (await pg.query(ext.text, ext.values)).rows.length === 1;
  const source = readFileSync(new URL("./service.server.ts", import.meta.url), "utf8") + readFileSync(new URL("./statements.ts", import.meta.url), "utf8");
  const reactivates = /update stays[\s\S]{0,200}?set status = 'ACTIVE'/.test(source);
  assert.ok(reactivates || (canOrder && canExtend), "no code path returns a CHECKOUT_PENDING stay to ACTIVE, and the guest can neither order nor extend");
});
