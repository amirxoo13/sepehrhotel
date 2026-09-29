# Sepehr Apartment Hotel — operations notes

This app runs as one TanStack Start server. Preview uses embedded Postgres (wiped on process restart). A deployed copy is provisioned Postgres by the platform when migrations exist. Do not commit secrets. This workspace does not use a `.env` file; the platform injects `DATABASE_URL` and auth credentials on deploy.

## What is real

- Reservations, stays, orders, folios, payments recorded by staff, roles, and audit rows are database records.
- A room-night primary key rejects a second reservation for the same room and night. Overlapping requests for the last free unit return no row.
- Guests can order only against their own active stay. Checked-out stays cannot place orders.
- Coffee-shop items are stored with department `COFFEE_SHOP`. Water is `HOUSEKEEPING`.
- A cancelled order does not insert a folio line. Delivery is refused while a non-complimentary item has no price.
- Checkout is refused while the folio balance is positive. There is no override permission in the seeded roles.
- Notifications are rows. The live channel is server-sent events that poll those rows every three seconds, because pooled Postgres cannot keep `LISTEN/NOTIFY`. Each stream ends itself after 55 seconds (the Vercel Function it runs in has a hard time limit) and the browser reconnects; while disconnected the screen says so and refreshes from the database every 12 seconds.

## Not connected

- Card/online payment gateway: a `GATEWAY` payment is stored as `PENDING_GATEWAY` and does not reduce the balance. **BLOCKED BY EXTERNAL DEPENDENCY** (merchant id, callback URL, provider).
- SMS and email delivery: in-app notifications only. **BLOCKED BY EXTERNAL DEPENDENCY**.
- Distributed rate limiting across multiple instances: the limiter is in-process. **NOT VERIFIED** under more than one server.
- Photographs: listing images were not copied. Licences were not verified. Staff may attach an `https` URL they are allowed to use.
- Nightly rates start empty. Third-party prices were not loaded as charges.
- Room 1–40 type and floor grouping is an operational default, labelled in the database, not a verified floor plan.
- Parking capacity is not asserted. Sources conflict.
- Backups: platform Postgres may offer its own backups. Restoration has **NOT VERIFIED** been tested here. Do not describe it as proven recoverable.

## Deployment environment (Vercel)

Besides the Neon `DATABASE_URL`, the deployed app needs:

- `BETTER_AUTH_URL` — the public origin, e.g. `https://sepehrhotel.vercel.app`. Without it Better Auth only trusts the Grok sandbox hosts and rejects every sign-in from the site itself with `403 INVALID_ORIGIN`.
- `BETTER_AUTH_SECRET` — a fixed random value of at least 32 bytes (`openssl rand -hex 32`). Without it every server instance signs sessions with its own random key and sessions do not survive between instances; production refuses to start without it.
- `BOOTSTRAP_ADMIN_EMAIL` (recommended) — the only e-mail address allowed to claim hotel admin. Without it the first signed-in account that opens Operations becomes admin.
- `EXTRA_TRUSTED_ORIGINS` (optional) — comma-separated extra origins such as a custom domain. Vercel preview hosts are trusted automatically.
- `MIGRATE_ON_PREVIEW` (optional, `1`) — lets a preview build apply migrations. By default only production builds migrate: Vercel hands every branch the same `DATABASE_URL`, so a preview build would otherwise change the production schema. A preview that needs a new migration should point at its own Neon branch (set a preview-scoped `DATABASE_URL`) and set this flag.

Production refuses to start without `DATABASE_URL` rather than falling back to the in-memory PGLite database, which would silently lose every write per function instance. The PGLite runtime (about 16 MB) is only copied into the server function for builds without a database.

## First admin

There is no seeded staff password. The first signed-in person who claims Operations becomes hotel admin, once (or only `BOOTSTRAP_ADMIN_EMAIL`, when set). They then grant roles to accounts picked from the staff directory; sign-up e-mails are not verified, so check the name, e-mail and sign-up date against the real person before granting. Claim this before sharing the address. The last admin cannot remove their own admin role.

## Currency and time

Money is integer toman (IRT). Tehran time is `Asia/Tehran`. Dates are stored as civil dates. The guest interface can show the Jalali calendar beside the Gregorian date.
