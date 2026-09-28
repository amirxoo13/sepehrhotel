# Sepehr Apartment Hotel — operations notes

This app runs as one TanStack Start server. Preview uses embedded Postgres (wiped on process restart). A deployed copy is provisioned Postgres by the platform when migrations exist. Do not commit secrets. This workspace does not use a `.env` file; the platform injects `DATABASE_URL` and auth credentials on deploy.

## What is real

- Reservations, stays, orders, folios, payments recorded by staff, roles, and audit rows are database records.
- A room-night primary key rejects a second reservation for the same room and night. Overlapping requests for the last free unit return no row.
- Guests can order only against their own active stay. Checked-out stays cannot place orders.
- Coffee-shop items are stored with department `COFFEE_SHOP`. Water is `HOUSEKEEPING`.
- A cancelled order does not insert a folio line. Delivery is refused while a non-complimentary item has no price.
- Checkout is refused while the folio balance is positive. There is no override permission in the seeded roles.
- Notifications are rows. The live channel is server-sent events that poll those rows every two seconds, because pooled Postgres cannot keep `LISTEN/NOTIFY`. If the stream drops, the screen says so and refreshes from the database.

## Not connected

- Card/online payment gateway: a `GATEWAY` payment is stored as `PENDING_GATEWAY` and does not reduce the balance. **BLOCKED BY EXTERNAL DEPENDENCY** (merchant id, callback URL, provider).
- SMS and email delivery: in-app notifications only. **BLOCKED BY EXTERNAL DEPENDENCY**.
- Distributed rate limiting across multiple instances: the limiter is in-process. **NOT VERIFIED** under more than one server.
- Photographs: listing images were not copied. Licences were not verified. Staff may attach an `https` URL they are allowed to use.
- Nightly rates start empty. Third-party prices were not loaded as charges.
- Room 1–40 type and floor grouping is an operational default, labelled in the database, not a verified floor plan.
- Parking capacity is not asserted. Sources conflict.
- Backups: platform Postgres may offer its own backups. Restoration has **NOT VERIFIED** been tested here. Do not describe it as proven recoverable.

## First admin

There is no seeded staff password. The first signed-in person who claims Operations becomes hotel admin, once. They then grant roles to people who already created accounts. Claim this before sharing the address.

## Currency and time

Money is integer toman (IRT). Tehran time is `Asia/Tehran`. Dates are stored as civil dates. The guest interface can show the Jalali calendar beside the Gregorian date.
