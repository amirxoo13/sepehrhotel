-- Audit fixes (priority 0). See src/lib/hotel/audit-p0.poc.test.ts.

-- F1: money in integer toman overflows int4 (max 2,147,483,647). The owner
-- tariff is 6.7M–11.8M per night; a 200-night stay or one week of a full house
-- already exceeds it. Widen every money column to bigint. Both drivers parse
-- int8 as a JS number (src/lib/db.ts), so callers see no shape change.
alter table room_types alter column base_rate_toman type bigint;
alter table reservations alter column nightly_rate_toman type bigint;
alter table services alter column price_toman type bigint;
alter table order_items alter column unit_price_toman type bigint;
alter table folio_items alter column amount_toman type bigint;
alter table payments alter column amount_toman type bigint;
alter table extension_requests alter column quoted_amount_toman type bigint;

-- F2: one in-house stay per room, enforced by the database as well as by
-- checkInSql (src/lib/hotel/statements.ts).
create unique index if not exists stays_one_active_per_room
  on stays (room_id)
  where status in ('ACTIVE', 'CHECKOUT_PENDING');

-- F5: orders that no seeded role could finish.
--  * Front-desk services (wake-up call, taxi, special request) route to the
--    RECEPTION department, but RECEPTION had no order.* permissions beyond
--    order.queue, so nobody but an admin could accept them.
--  * HOUSEKEEPING could not price its own non-complimentary items (extra
--    towels, room cleaning, toiletries ship without a price), and delivery is
--    refused while a priced item has no price — the order was stuck at READY.
insert into role_permissions (role_code, permission_code) values
  ('RECEPTION','order.accept'),('RECEPTION','order.reject'),('RECEPTION','order.prepare'),
  ('RECEPTION','order.deliver'),('RECEPTION','order.complete'),('RECEPTION','order.price'),
  ('HOUSEKEEPING','order.price')
on conflict do nothing;
