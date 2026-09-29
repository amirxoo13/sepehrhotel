/**
 * Proof-of-concept tests for the priority-1 audit findings (authentication and
 * authorisation). Each test asserts the CORRECT behaviour, so it FAILS while
 * the bug exists.
 *
 * `src/lib/auth/server.ts` cannot be imported by the bare node test runner (it
 * pulls `../db`, which uses Vite's `import.meta.glob`). Where a test needs the
 * Better Auth instance, it builds one with the SAME option values copied
 * verbatim from `server.ts` (the source lines are named), on the real
 * `migrations/0001_auth.sql` schema in PGLite through the app's own
 * `pgliteDialect`.
 *
 * Production facts these tests model (read from the Vercel project on
 * 2026-09-29): the only environment variables are the Neon `DATABASE_*` ones.
 * `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `VITE_AUTH_ENABLED`, `GROK_*` are all
 * unset. The public host is `sepehrhotel.vercel.app`.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { serverFnFetcher } from "../../../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { pgliteDialect } from "./pglite-dialect.ts";
import { PREVIEW_ALLOWED_HOSTS } from "./preview.ts";

const PROD_ORIGIN = "https://sepehrhotel.vercel.app";

async function authDatabase() {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(readFileSync(new URL("../../../migrations/0001_auth.sql", import.meta.url), "utf8"));
  return pg;
}

/**
 * Verbatim from server.ts (lines 88-106, 110-120): the baseURL and
 * trustedOrigins the app uses when BETTER_AUTH_URL is NOT set — the state of
 * the Vercel project today.
 */
function productionAuthOptions(pg: PGlite, secret: string) {
  const previewAllowedHosts: string[] = [...PREVIEW_ALLOWED_HOSTS];
  const LOCAL_DEV_ORIGINS: string[] = ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"];
  const baseURL = {
    allowedHosts: [...previewAllowedHosts, "localhost", "127.0.0.1", "[::1]"],
    protocol: "auto" as const,
    fallback: "http://localhost:8080",
  };
  const trustedOrigins: string[] = [
    ...previewAllowedHosts,
    ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
    ...LOCAL_DEV_ORIGINS,
  ];
  return {
    baseURL,
    trustedOrigins,
    secret,
    database: { dialect: pgliteDialect(() => pg), type: "postgres" as const },
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    advanced: {
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, sameSite: "lax" as const, path: "/" },
      cookies: {
        session_token: { name: "__Host-grok-auth.session_token" },
        session_data: { name: "__Host-grok-auth.session_data" },
      },
    },
  };
}

function browserPost(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`${PROD_ORIGIN}/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: PROD_ORIGIN,
      host: "sepehrhotel.vercel.app",
      "x-forwarded-proto": "https",
      // A real browser on a site that has ever set a cookie sends one.
      cookie: "__Host-grok-auth.dont_remember=",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// A1 — nobody can sign in or sign up on the deployed site. Without
// BETTER_AUTH_URL the dynamic baseURL allows only *.grok-sandbox.com and
// loopback hosts, and the app's trustedOrigins list (server.ts lines 110-120)
// never contains the public host. Better Auth's origin check therefore rejects
// every credentialed POST from the site itself. Reproduced live on
// https://sepehrhotel.vercel.app/api/auth/sign-in/email → 403 INVALID_ORIGIN.
// ---------------------------------------------------------------------------
test("A1: a sign-in POST from the site's own origin must not be rejected as a foreign origin", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(productionAuthOptions(pg, randomBytes(32).toString("hex")));
  const res = await auth.handler(
    browserPost("/sign-in/email", { email: "nobody@example.invalid", password: "not-a-real-password" }),
  );
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  // Correct: the account does not exist, so 401 (invalid credentials), never 403 INVALID_ORIGIN.
  assert.notEqual(body.code, "INVALID_ORIGIN", `got ${res.status} ${JSON.stringify(body)}`);
  assert.equal(res.status, 401);
});

test("A1b: with BETTER_AUTH_URL set to the public origin the same request is accepted (control)", async () => {
  const pg = await authDatabase();
  const options = productionAuthOptions(pg, randomBytes(32).toString("hex"));
  const auth = betterAuth({ ...options, baseURL: PROD_ORIGIN, trustedOrigins: [PROD_ORIGIN] });
  const res = await auth.handler(
    browserPost("/sign-in/email", { email: "nobody@example.invalid", password: "not-a-real-password" }),
  );
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// A2 — sessions do not survive across server instances. BETTER_AUTH_SECRET is
// unset on Vercel, so server.ts line 60-63 mints a random secret per process
// (`previewAuthSecret()`, stored on globalThis). Every Vercel function instance
// and every cold start has a different secret; a session cookie signed by one
// instance is invalid on the next.
// ---------------------------------------------------------------------------
test("A2: a session created by one server instance must still be valid on another instance", async () => {
  const pg = await authDatabase();
  // Two instances of the app, same database, each with its own previewAuthSecret().
  const base = { ...productionAuthOptions(pg, "unused"), baseURL: PROD_ORIGIN, trustedOrigins: [PROD_ORIGIN] };
  const instanceA = betterAuth({ ...base, secret: randomBytes(32).toString("hex") });
  const instanceB = betterAuth({ ...base, secret: randomBytes(32).toString("hex") });

  const signUp = await instanceA.handler(
    browserPost("/sign-up/email", { email: "guest@example.com", password: "correct-horse-battery", name: "Guest" }),
  );
  assert.equal(signUp.status, 200, await signUp.text());
  const setCookies = signUp.headers.getSetCookie();
  const sessionCookie = setCookies
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("__Host-grok-auth.session_token="));
  assert.ok(sessionCookie, "sign-up must set the session cookie");

  const onB = await instanceB.handler(
    new Request(`${PROD_ORIGIN}/api/auth/get-session`, {
      headers: { cookie: sessionCookie as string, host: "sepehrhotel.vercel.app", "x-forwarded-proto": "https" },
    }),
  );
  const session = (await onB.json()) as { user?: { email: string } } | null;
  assert.equal(session?.user?.email, "guest@example.com", "the next instance must recognise the session");
});

// ---------------------------------------------------------------------------
// A3 — the session bearer token is written into request URLs. login.tsx
// (`keepToken`) stores the `set-auth-token` header in sessionStorage on every
// sign-in, deployed included. middleware.ts forwards it as `sendContext`, and
// TanStack Start serialises the context of a GET server function into the
// query string. api.ts declares 19 GET server functions with authMiddleware
// (getSessionContext, listMyReservations, getMyFolio, getOpsSnapshot, …), so
// the token lands in Vercel request logs, browser history and Referer headers.
// ---------------------------------------------------------------------------
test("A3: the bearer token forwarded by authMiddleware must not appear in a GET server function URL", async () => {
  let requestedUrl = "";
  const fakeFetch = async (url: string) => {
    requestedUrl = url;
    return new Response("null", { headers: { "content-type": "application/json", "x-tss-serialized": "true" } });
  };
  // The fetcher reads Start options from AsyncLocalStorage; give it an empty set.
  // Only the outgoing URL matters here, so a failure to decode the stub reply is ignored.
  await runWithStartContext({ startOptions: {} } as never, () =>
    serverFnFetcher(
      "/_serverFn/getSessionContext",
      [{ method: "GET", context: { bearerToken: "SESSION-TOKEN-SECRET" } }],
      fakeFetch as unknown as typeof fetch,
    ),
  ).catch(() => undefined);
  assert.ok(requestedUrl.startsWith("/_serverFn/getSessionContext"));
  assert.ok(!decodeURIComponent(requestedUrl).includes("SESSION-TOKEN-SECRET"), `token leaked in URL: ${requestedUrl}`);
});

// ---------------------------------------------------------------------------
// A4 — staff roles are granted to an unverified e-mail address. Sign-up creates
// users with emailVerified = false (Better Auth default; the app sets no
// requireEmailVerification), and staffAssignRole (service.server.ts) looks the
// target up by e-mail alone. Whoever registers `manager@…` first receives the
// role the admin meant for the real manager.
// ---------------------------------------------------------------------------
test("A4: a role grant must not resolve to an account whose e-mail was never verified", async () => {
  const pg = await authDatabase();
  const auth = betterAuth({ ...productionAuthOptions(pg, randomBytes(32).toString("hex")), baseURL: PROD_ORIGIN, trustedOrigins: [PROD_ORIGIN] });
  const res = await auth.handler(
    browserPost("/sign-up/email", { email: "manager@sepehrhotel.example", password: "attacker-password-1", name: "Mallory" }),
  );
  assert.equal(res.status, 200);
  // Verbatim lookup from staffAssignRole (service.server.ts):
  const target = await pg.query<{ id: string; emailVerified: boolean }>(
    `select id, "emailVerified" from "user" where lower(email) = lower($1)`,
    ["manager@sepehrhotel.example"],
  );
  assert.equal(target.rows.length, 1, "the impostor account is what the grant would hit");
  assert.equal(target.rows[0].emailVerified, true, "grants must require a verified e-mail (or an explicit user id)");
});
