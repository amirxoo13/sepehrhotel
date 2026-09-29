-- Better Auth rate-limit storage ("database" strategy). Sign-in / sign-up
-- attempts are counted here instead of in each server instance's memory, so
-- the limit holds across every Vercel function instance. Columns follow Better
-- Auth's rateLimit model: camelCase, double-quoted.
create table if not exists "rateLimit" (
  "id" text primary key,
  "key" text not null,
  "count" integer not null,
  "lastRequest" bigint not null
);

create index if not exists "rateLimit_key_idx" on "rateLimit" ("key");
