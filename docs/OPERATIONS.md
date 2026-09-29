# Sepehr Apartment Hotel — operations notes

This app runs as one TanStack Start server. Local development and the tests use an embedded Postgres (PGLite, wiped when the process ends). The deployed copy on Vercel uses the Neon Postgres named by `DATABASE_URL`. Do not commit secrets; there is no `.env` file, the Vercel project holds the variables.

## What is real

- Reservations, stays, orders, folios, payments recorded by staff, roles, and audit rows are database records.
- A room-night primary key rejects a second reservation for the same room and night. Overlapping requests for the last free unit return no row. A partial unique index keeps one in-house stay per room.
- Every room type carries the hotel tariff, so a request is confirmed at once with that rate; reception can correct the nightly rate until check-in.
- Guests can order only against their own active stay. Checked-out stays cannot place orders. A guest who requested checkout can withdraw the request and stay on.
- Coffee-shop items are stored with department `COFFEE_SHOP`. Water is `HOUSEKEEPING`. Front-desk requests (wake-up call, taxi, special request) are handled by reception.
- A room put into MAINTENANCE, OUT_OF_SERVICE or BLOCKED while a guest is in house keeps that status at checkout (only an ordinary occupied room goes to CLEANING); housekeeping still gets the checkout-clean task.
- A cancelled order does not insert a folio line. Delivery is refused while a non-complimentary item has no price; the department (housekeeping included) can price it first.
- Checkout is refused while the folio balance is positive. There is no override permission in the seeded roles.
- Money columns are 64-bit integers (toman); a full house for months does not overflow.
- Notifications are rows. The live channel is server-sent events that poll those rows every three seconds, because pooled Postgres cannot keep `LISTEN/NOTIFY`. Each stream ends itself after 55 seconds (the Vercel Function it runs in has a hard time limit) and the browser reconnects; while disconnected the screen says so and refreshes from the database every 12 seconds.
- Sign-in and sign-up attempts are rate-limited in the database (Better Auth's `rateLimit` table), so the limit holds across every server instance.

## Look of the site

`/` is the hotel's former page from the Melal Group site, served from the saved copy in `old-site/` (see README): same markup, theme stylesheets and photographs; English, left-to-right, without the app shell. Its links go to this site's pages (About us → `/hotel`, Contact us → `/contact`, each room box → `/rooms`, the search box → `/search`, which searches room types, facilities and policies from the database).

Every other page renders on the same theme stylesheets, inside the old page's header (logo, menu, search icon), its title band and its footer, produced by `AppShell` in `src/components/hotel/shell.tsx` with the same markup and classes as the saved page. The menu carries this site's pages, a "Reserve" entry, an "Account" sub-menu (My stay, Operations for staff, Sign out) and the language switch; the header and footer stay left-to-right and English like the home page, the content follows the chosen language. The app's own components (`src/styles.css`) use the home page's palette: beige `#f0e7d8` and peach `#eaccbb` panels, tan `#e2c8a1` labels, brown `#99713a` bars, `#825339` links and buttons, Arial.

Two things are still as on the old page and need the owner's decision: the seven footer social icons link to `#` (the old page had no addresses either), and the copyright line reads as it did there. One CSS background image the browser did not save (`home_lawyer_section.jpg`) is still loaded from the old host.

## Not connected

- Card/online payment gateway: a `GATEWAY` payment is stored as `PENDING_GATEWAY` and does not reduce the balance. **BLOCKED BY EXTERNAL DEPENDENCY** (merchant id, callback URL, provider).
- SMS and email delivery: in-app notifications only. **BLOCKED BY EXTERNAL DEPENDENCY**. Consequences: sign-up e-mails are not verified, and a guest who forgets their password cannot reset it alone — a hotel admin resets it from Operations and hands the new password over in person.
- Backups: Neon offers its own point-in-time restore. Restoration has **NOT VERIFIED** been tested here. Do not describe it as proven recoverable.

## Deployment environment (Vercel)

Besides the Neon `DATABASE_URL`, the deployed app needs:

- `BETTER_AUTH_URL` — the public origin, e.g. `https://sepehrhotel.vercel.app`. Production refuses to start without it; otherwise every sign-in from the site would be rejected as a foreign origin.
- `BETTER_AUTH_SECRET` — a fixed random value of at least 32 bytes (`openssl rand -hex 32`). Production refuses to start without it; a per-instance random secret would invalidate sessions on every cold start.
- `BOOTSTRAP_ADMIN_EMAIL` (recommended) — the only e-mail address allowed to claim hotel admin. Without it the first signed-in account that opens Operations becomes admin.
- `EXTRA_TRUSTED_ORIGINS` (optional) — comma-separated extra origins such as a custom domain. Vercel preview hosts are trusted automatically.
- `VITE_PUBLIC_SITE_URL` (optional) — absolute origin used for the share-card image (`/og.jpg`); defaults to `https://sepehrhotel.vercel.app`.
- `MIGRATE_ON_PREVIEW` (optional, `1`) — lets a preview build apply migrations. By default only production builds migrate: Vercel hands every branch the same `DATABASE_URL`, so a preview build would otherwise change the production schema. A preview that needs a new migration should point at its own Neon branch (set a preview-scoped `DATABASE_URL`) and set this flag.

Production refuses to start without `DATABASE_URL` rather than falling back to the in-memory PGLite database, which would silently lose every write per function instance. The PGLite runtime (about 16 MB) is only copied into the server function for builds without a database.

## First admin

There is no seeded staff password. The first signed-in person who claims Operations becomes hotel admin, once (or only `BOOTSTRAP_ADMIN_EMAIL`, when set). They then grant roles to accounts picked from the staff directory; sign-up e-mails are not verified, so check the name, e-mail and sign-up date against the real person before granting. Claim this before sharing the address. The last admin cannot remove their own admin role. Only a super admin can reset another admin's password.

## Currency and time

Money is integer toman (IRT). Tehran time is `Asia/Tehran`. Dates are stored as civil dates. The guest interface can show the Jalali calendar beside the Gregorian date.
