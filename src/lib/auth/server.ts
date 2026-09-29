/**
 * Better Auth for this app (server-only). Email + password accounts, cookie
 * sessions, same-origin `/api/auth/*`.
 *
 *   - Deployed: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `DATABASE_URL`
 *     come from the Vercel project (see docs/OPERATIONS.md).
 *   - Local `npm run dev` / tests: no variables needed — sessions and
 *     accounts live in the embedded PGLite database, which is wiped when the
 *     process ends, and the signing secret is minted per process.
 *
 * NEVER import this from client code. The client uses `@/lib/auth/client`;
 * components read the user via `@/lib/auth/use-current-user`; server functions
 * get a verified id via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { resolveBaseUrl, resolveSecret, resolveTrustedOrigins } from "./config";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Local secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __authLocalSecret__?: string;
};
function localSecret(): string {
  globalAuthRef.__authLocalSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__authLocalSecret__;
}

const env = process.env;
const databaseUrl = env.DATABASE_URL?.trim();

// Real Postgres when `DATABASE_URL` is set (deployed), else the app's embedded
// PGLite via a Kysely dialect — so Better Auth persists to the SAME DB as app
// data. Both use the schema from `migrations/0001_auth.sql`.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name. */
export const SESSION_TOKEN_COOKIE = "__Host-auth.session_token";

export const auth = betterAuth({
  baseURL: resolveBaseUrl(env),
  secret: resolveSecret(env, localSecret),
  database,

  // CSRF / origin check for credentialed auth POSTs. Missing entries surface
  // as FORBIDDEN "Invalid origin".
  trustedOrigins: resolveTrustedOrigins(env),

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB.
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  emailAndPassword: { enabled: true },

  // Sign-in / sign-up attempts are limited in the database (3 per 10 s per
  // address by Better Auth's default rule), so the limit holds across every
  // server instance. Table: migrations/0006_rate_limit.sql. Enabled in
  // production by default; `rateLimit.enabled` is honoured in tests.
  rateLimit: { storage: "database", modelName: "rateLimit" },

  // `__Host-` prefixed cookies: the browser refuses any same-named cookie that
  // carries a `Domain` attribute. `__Host-` requires Secure + Path=/ + no
  // Domain; Better Auth otherwise uses `__Secure-`, so we drop its auto prefix
  // and set Secure + the names ourselves. Browsers allow Secure cookies on
  // `http://localhost`, so local dev still works.
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-auth.session_data" },
      account_data: { name: "__Host-auth.account_data" },
      dont_remember: { name: "__Host-auth.dont_remember" },
    },
  },

  // Bridges Better Auth's Set-Cookie into TanStack Start responses.
  plugins: [tanstackStartCookies()],
});
