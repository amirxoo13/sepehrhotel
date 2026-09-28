import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { bookRoomSql, placeOrderSql, releaseReservationSql, transitionOrderSql } from "./statements.ts";

async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(readFileSync(new URL("../../../migrations/0001_auth.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../migrations/0002_hotel.sql", import.meta.url), "utf8"));
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('guest-a', 'Guest A', 'a@example.com', true, now(), now()),
            ('guest-b', 'Guest B', 'b@example.com', true, now(), now())`,
  );
  return pg;
}

test("one room cannot be sold twice for the same nights", async () => {
  const pg = await database();
  await pg.query(
    `update rooms set status = 'BLOCKED' where room_type_code = 'STUDIO' and number <> 1`,
  );
  const first = bookRoomSql({
    roomType: "STUDIO",
    userId: "guest-a",
    code: "SPTEST01",
    checkIn: "2026-10-10",
    checkOut: "2026-10-12",
    adults: 1,
    children: 0,
    guestName: "Guest A",
    guestPhone: null,
    notes: null,
    idempotencyKey: "idem-a-1",
    nights: ["2026-10-10", "2026-10-11"],
    today: "2026-09-28",
    nightlyRate: null,
    status: "PENDING",
  });
  const a = await pg.query<{ id: number; room_number: number; night_count: number }>(first.text, first.values);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].room_number, 1);
  assert.equal(a.rows[0].night_count, 2);

  const second = bookRoomSql({
    roomType: "STUDIO",
    userId: "guest-b",
    code: "SPTEST02",
    checkIn: "2026-10-11",
    checkOut: "2026-10-13",
    adults: 1,
    children: 0,
    guestName: "Guest B",
    guestPhone: null,
    notes: null,
    idempotencyKey: "idem-b-1",
    nights: ["2026-10-11", "2026-10-12"],
    today: "2026-09-28",
    nightlyRate: null,
    status: "PENDING",
  });
  const b = await pg.query(second.text, second.values);
  assert.equal(b.rows.length, 0, "overlapping night on the only sellable studio must not insert");

  await assert.rejects(
    pg.query(
      `insert into room_nights (room_id, night, reservation_id)
       select room_id, '2026-10-10', reservation_id from room_nights limit 1`,
    ),
    /duplicate key|unique/i,
  );
});

test("cancelling a hold releases the nights", async () => {
  const pg = await database();
  const booked = bookRoomSql({
    roomType: "SUITE",
    userId: "guest-a",
    code: "SPTEST03",
    checkIn: "2026-11-01",
    checkOut: "2026-11-03",
    adults: 2,
    children: 0,
    guestName: "Guest A",
    guestPhone: null,
    notes: null,
    idempotencyKey: "idem-a-2",
    nights: ["2026-11-01", "2026-11-02"],
    today: "2026-09-28",
    nightlyRate: 1000,
    status: "CONFIRMED",
  });
  const row = await pg.query<{ id: number }>(booked.text, booked.values);
  const release = releaseReservationSql({
    reservationId: row.rows[0].id,
    actorId: "guest-a",
    nextStatus: "CANCELLED",
    ownerOnly: true,
  });
  const freed = await pg.query<{ released: number }>(release.text, release.values);
  assert.equal(freed.rows[0].released, 2);
  const again = bookRoomSql({
    roomType: "SUITE",
    userId: "guest-b",
    code: "SPTEST04",
    checkIn: "2026-11-01",
    checkOut: "2026-11-03",
    adults: 2,
    children: 0,
    guestName: "Guest B",
    guestPhone: null,
    notes: null,
    idempotencyKey: "idem-b-2",
    nights: ["2026-11-01", "2026-11-02"],
    today: "2026-09-28",
    nightlyRate: 1000,
    status: "CONFIRMED",
  });
  const next = await pg.query(again.text, again.values);
  assert.equal(next.rows.length, 1);
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
  await pg.query(
    `insert into folios (stay_id, reservation_id, user_id)
     select s.id, s.reservation_id, s.user_id from stays s`,
  );
  const coffee = await pg.query<{ id: number }>(`select id from services where code = 'coffee'`);
  const stay = await pg.query<{ id: number }>(`select id from stays limit 1`);
  const order = placeOrderSql({
    code: "SOCOFFEE",
    stayId: stay.rows[0].id,
    userId: "guest-a",
    serviceId: coffee.rows[0].id,
    quantity: 1,
    notes: null,
    idempotencyKey: "idem-coffee",
    priority: "NORMAL",
    serviceDate: null,
    serviceTime: null,
    guestCount: null,
    laundryLabel: null,
    plate: null,
    vehicleType: null,
    issueCode: null,
  });
  const placed = await pg.query<{ department_code: string; id: number }>(order.text, order.values);
  assert.equal(placed.rows[0].department_code, "COFFEE_SHOP");

  const water = await pg.query<{ id: number }>(`select id from services where code = 'extra_water'`);
  const waterOrder = placeOrderSql({
    code: "SOWATER",
    stayId: stay.rows[0].id,
    userId: "guest-a",
    serviceId: water.rows[0].id,
    quantity: 2,
    notes: null,
    idempotencyKey: "idem-water",
    priority: "NORMAL",
    serviceDate: null,
    serviceTime: null,
    guestCount: null,
    laundryLabel: null,
    plate: null,
    vehicleType: null,
    issueCode: null,
  });
  const waterRow = await pg.query<{ department_code: string }>(waterOrder.text, waterOrder.values);
  assert.equal(waterRow.rows[0].department_code, "HOUSEKEEPING");

  const wrongGuest = placeOrderSql({
    code: "SOBAD",
    stayId: stay.rows[0].id,
    userId: "guest-b",
    serviceId: coffee.rows[0].id,
    quantity: 1,
    notes: null,
    idempotencyKey: "idem-bad",
    priority: "NORMAL",
    serviceDate: null,
    serviceTime: null,
    guestCount: null,
    laundryLabel: null,
    plate: null,
    vehicleType: null,
    issueCode: null,
  });
  const denied = await pg.query(wrongGuest.text, wrongGuest.values);
  assert.equal(denied.rows.length, 0);

  const cancel = transitionOrderSql({
    orderId: placed.rows[0].id,
    actorId: "guest-a",
    from: "PENDING",
    to: "CANCELLED",
    department: null,
  });
  await pg.query(cancel.text, cancel.values);
  const charges = await pg.query<{ n: number }>(
    `select count(*)::int as n from folio_items where source_type = 'SERVICE_ORDER'`,
  );
  assert.equal(charges.rows[0].n, 0);

  await pg.query(`update stays set status = 'CLOSED'`);
  const after = placeOrderSql({
    code: "SOAFTER",
    stayId: stay.rows[0].id,
    userId: "guest-a",
    serviceId: coffee.rows[0].id,
    quantity: 1,
    notes: null,
    idempotencyKey: "idem-after",
    priority: "NORMAL",
    serviceDate: null,
    serviceTime: null,
    guestCount: null,
    laundryLabel: null,
    plate: null,
    vehicleType: null,
    issueCode: null,
  });
  const closed = await pg.query(after.text, after.values);
  assert.equal(closed.rows.length, 0);
});
