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
import { BEARER_KEY, rememberBearerToken } from "./bearer-storage.ts";

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
test("A1: without BETTER_AUTH_URL the deployed site rejects its own origin (the bug, as shipped)", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(productionAuthOptions(pg, randomBytes(32).toString("hex")));
  const res = await auth.handler(
    browserPost("/sign-in/email", { email: "nobody@example.invalid", password: "not-a-real-password" }),
  );
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  // This is the failure mode reproduced live on 2026-09-29; the fix is the
  // environment variable exercised by A1b, so this case documents the trap.
  assert.equal(res.status, 403);
  assert.equal(body.code, "INVALID_ORIGIN");
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
async function sessionAcrossInstances(secretA: string, secretB: string): Promise<string | undefined> {
  const pg = await authDatabase();
  // Two instances of the app, same database.
  const base = { ...productionAuthOptions(pg, "unused"), baseURL: PROD_ORIGIN, trustedOrigins: [PROD_ORIGIN] };
  const instanceA = betterAuth({ ...base, secret: secretA });
  const instanceB = betterAuth({ ...base, secret: secretB });

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
  return session?.user?.email;
}

test("A2: without BETTER_AUTH_SECRET each instance mints its own secret and sessions do not carry over (the bug, as shipped)", async () => {
  // server.ts previewAuthSecret(): randomBytes(32) per process.
  const email = await sessionAcrossInstances(randomBytes(32).toString("hex"), randomBytes(32).toString("hex"));
  assert.equal(email, undefined, "instance B cannot verify a cookie signed by instance A");
});

test("A2b: with one fixed BETTER_AUTH_SECRET the session is valid on every instance (control)", async () => {
  const fixed = randomBytes(32).toString("hex");
  const email = await sessionAcrossInstances(fixed, fixed);
  assert.equal(email, "guest@example.com");
});

// ---------------------------------------------------------------------------
// A3 — the session bearer token must never reach a request URL on the deployed
// site. TanStack Start serialises the context of a GET server function into the
// query string (demonstrated by A3a with the real client fetcher). The token
// therefore may only exist inside the live-preview iframe, where cookies are
// partitioned; login.tsx and middleware.ts gate on that host through
// bearer-storage.ts (A3b).
// ---------------------------------------------------------------------------
test("A3a: TanStack Start puts GET server-function context into the URL (why the token must not exist deployed)", async () => {
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
  assert.ok(decodeURIComponent(requestedUrl).includes("SESSION-TOKEN-SECRET"), "context is URL-encoded for GET");
});

test("A3b: the sign-in response token is kept only on the live-preview host", () => {
  const response = { headers: { get: (name: string) => (name === "set-auth-token" ? "SESSION-TOKEN-SECRET" : null) } };
  const stored = new Map<string, string>();
  const storage = { setItem: (k: string, v: string) => void stored.set(k, v) };
  assert.equal(rememberBearerToken(response, "sepehrhotel.vercel.app", storage), null);
  assert.equal(rememberBearerToken(response, "sepehrhotel-git-x-y.vercel.app", storage), null);
  assert.equal(stored.size, 0, "nothing may be stored on a deployed host");
  assert.equal(rememberBearerToken(response, "abc123.grok-sandbox.com", storage), "SESSION-TOKEN-SECRET");
  assert.equal(stored.get(BEARER_KEY), "SESSION-TOKEN-SECRET");
});

// ---------------------------------------------------------------------------
// A4 — staff roles must not be granted to whoever typed an e-mail first.
// Sign-up creates users with emailVerified = false (Better Auth default; the
// app sets no requireEmailVerification), so a free-text e-mail lookup would
// hand the role to an impostor who registered the manager's address. The
// grant therefore targets an account id chosen from the staff directory, which
// also shows the verification flag and sign-up date.
// ---------------------------------------------------------------------------
test("A4: the role grant resolves an explicit account id and the directory exposes unverified e-mails", async () => {
  const pg = await authDatabase();
  const auth = betterAuth({ ...productionAuthOptions(pg, randomBytes(32).toString("hex")), baseURL: PROD_ORIGIN, trustedOrigins: [PROD_ORIGIN] });
  const res = await auth.handler(
    browserPost("/sign-up/email", { email: "manager@sepehrhotel.example", password: "attacker-password-1", name: "Mallory" }),
  );
  assert.equal(res.status, 200);
  const service = readFileSync(new URL("../hotel/service.server.ts", import.meta.url), "utf8");
  const assign = service.slice(service.indexOf("export async function staffAssignRole"));
  assert.ok(!/lower\(email\)\s*=\s*lower\(/.test(assign.slice(0, assign.indexOf("\n}"))), "staffAssignRole must not look the target up by e-mail");
  assert.ok(/from "user" where id = \$\{String\(targetUserId\)/.test(assign), "staffAssignRole looks the target up by id");
  // Verbatim from staffDirectory (service.server.ts):
  const directory = await pg.query<{ email: string; email_verified: boolean }>(`
    select u.id, u.name, u.email,
           u."emailVerified" as email_verified,
           u."createdAt" as created_at,
           coalesce(string_agg(ur.role_code, ',' order by ur.role_code), '') as roles
      from "user" u
      left join user_roles ur on ur.user_id = u.id
     group by u.id, u.name, u.email, u."emailVerified", u."createdAt"
     order by u.email
     limit 100`).catch(async () => {
    // user_roles lives in 0002; the auth schema alone is enough to prove the flag.
    return pg.query<{ email: string; email_verified: boolean }>(`select email, "emailVerified" as email_verified from "user"`);
  });
  const impostor = directory.rows.find((r) => r.email === "manager@sepehrhotel.example");
  assert.ok(impostor, "the impostor account is listed");
  assert.equal(impostor?.email_verified, false, "and is visibly unverified to the admin");
});
