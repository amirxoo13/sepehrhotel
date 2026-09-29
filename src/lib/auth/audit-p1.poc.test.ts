/**
 * Regression tests for the authentication findings of the 2026-09-29 audit.
 *
 * `src/lib/auth/server.ts` cannot be imported by the bare node test runner (it
 * pulls `../db`, which uses Vite's `import.meta.glob`), so each test builds a
 * Better Auth instance with the same option values `server.ts` derives (via
 * `config.ts`) on the real migration schema in PGLite through the app's own
 * `pgliteDialect`.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { resolveBaseUrl, resolveTrustedOrigins } from "./config.ts";
import { pgliteDialect } from "./pglite-dialect.ts";

const PROD_ORIGIN = "https://sepehrhotel.vercel.app";

async function authDatabase() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0001_auth.sql", "0006_rate_limit.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  return pg;
}

/** The options server.ts builds for the deployed site (BETTER_AUTH_URL set). */
function deployedAuthOptions(pg: PGlite, secret: string, rateLimit?: { enabled: boolean }) {
  const env = { BETTER_AUTH_URL: PROD_ORIGIN, VERCEL_ENV: "production" };
  return {
    baseURL: resolveBaseUrl(env),
    trustedOrigins: resolveTrustedOrigins(env),
    secret,
    database: { dialect: pgliteDialect(() => pg), type: "postgres" as const },
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    rateLimit: { storage: "database" as const, modelName: "rateLimit", ...(rateLimit ?? {}) },
    advanced: {
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, sameSite: "lax" as const, path: "/" },
      cookies: {
        session_token: { name: "__Host-auth.session_token" },
        session_data: { name: "__Host-auth.session_data" },
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
      "x-forwarded-for": "203.0.113.7",
      cookie: "__Host-auth.dont_remember=",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

// A1 — the site's own origin is trusted, so a sign-in reaches the credential
// check (401 for an unknown account), never 403 INVALID_ORIGIN.
test("A1: a sign-in POST from the site's own origin reaches the credential check", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(deployedAuthOptions(pg, randomBytes(32).toString("hex")));
  const res = await auth.handler(
    browserPost("/sign-in/email", { email: "nobody@example.invalid", password: "not-a-real-password" }),
  );
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  assert.notEqual(body.code, "INVALID_ORIGIN");
  assert.equal(res.status, 401);
});

test("A1b: a foreign origin is still rejected", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(deployedAuthOptions(pg, randomBytes(32).toString("hex")));
  const res = await auth.handler(
    browserPost("/sign-in/email", { email: "nobody@example.invalid", password: "x".repeat(12) }, { origin: "https://evil.example" }),
  );
  assert.equal(res.status, 403);
});

// A2 — one fixed BETTER_AUTH_SECRET keeps a session valid on every instance;
// per-instance random secrets (the old fallback) do not.
async function sessionAcrossInstances(secretA: string, secretB: string): Promise<string | undefined> {
  const pg = await authDatabase();
  const instanceA = betterAuth(deployedAuthOptions(pg, secretA));
  const instanceB = betterAuth(deployedAuthOptions(pg, secretB));
  const signUp = await instanceA.handler(
    browserPost("/sign-up/email", { email: "guest@example.com", password: "correct-horse-battery", name: "Guest" }),
  );
  assert.equal(signUp.status, 200, await signUp.text());
  const sessionCookie = signUp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("__Host-auth.session_token="));
  assert.ok(sessionCookie, "sign-up must set the session cookie");
  const onB = await instanceB.handler(
    new Request(`${PROD_ORIGIN}/api/auth/get-session`, {
      headers: { cookie: sessionCookie as string, host: "sepehrhotel.vercel.app", "x-forwarded-proto": "https" },
    }),
  );
  const session = (await onB.json()) as { user?: { email: string } } | null;
  return session?.user?.email;
}

test("A2: with one fixed secret the session is valid on every instance", async () => {
  const fixed = randomBytes(32).toString("hex");
  assert.equal(await sessionAcrossInstances(fixed, fixed), "guest@example.com");
});

test("A2b: with per-instance secrets sessions do not carry over (why production requires the variable)", async () => {
  assert.equal(await sessionAcrossInstances(randomBytes(32).toString("hex"), randomBytes(32).toString("hex")), undefined);
});

// A3 — sign-in attempts are limited in the database (holds across instances).
test("A3: repeated sign-in attempts are rate-limited through the rateLimit table", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(deployedAuthOptions(pg, randomBytes(32).toString("hex"), { enabled: true }));
  const statuses: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await auth.handler(
      browserPost("/sign-in/email", { email: "nobody@example.invalid", password: "wrong-password-1" }),
    );
    statuses.push(res.status);
  }
  assert.ok(statuses.includes(429), `expected a 429 within 5 attempts, got ${statuses.join(",")}`);
  const rows = await pg.query<{ n: number }>(`select count(*)::int as n from "rateLimit"`);
  assert.ok(rows.rows[0].n >= 1, "the counter lives in the database");
});

// A4 — staff roles target an account id from the directory, and the directory
// shows that a self-registered e-mail is unverified.
test("A4: the role grant resolves an explicit account id and the directory exposes unverified e-mails", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(deployedAuthOptions(pg, randomBytes(32).toString("hex")));
  const res = await auth.handler(
    browserPost("/sign-up/email", { email: "manager@sepehrhotel.example", password: "attacker-password-1", name: "Mallory" }),
  );
  assert.equal(res.status, 200);
  const service = readFileSync(new URL("../hotel/service.server.ts", import.meta.url), "utf8");
  const assign = service.slice(service.indexOf("export async function staffAssignRole"));
  assert.ok(!/lower\(email\)\s*=\s*lower\(/.test(assign.slice(0, assign.indexOf("\n}"))), "staffAssignRole must not look the target up by e-mail");
  assert.ok(/from "user" where id = \$\{String\(targetUserId\)/.test(assign), "staffAssignRole looks the target up by id");
  const directory = await pg.query<{ email: string; email_verified: boolean }>(
    `select email, "emailVerified" as email_verified from "user"`,
  );
  const impostor = directory.rows.find((r) => r.email === "manager@sepehrhotel.example");
  assert.ok(impostor, "the impostor account is listed");
  assert.equal(impostor?.email_verified, false, "and is visibly unverified to the admin");
});

// A5 — an admin password reset replaces the credential and signs the user out everywhere.
test("A5: an admin-side password reset replaces the hash and revokes every session", async () => {
  const pg = await authDatabase();
  const auth = betterAuth(deployedAuthOptions(pg, randomBytes(32).toString("hex")));
  const signUp = await auth.handler(
    browserPost("/sign-up/email", { email: "forgetful@example.com", password: "old-password-123", name: "Guest" }),
  );
  assert.equal(signUp.status, 200);
  const oldCookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("__Host-auth.session_token="));
  const user = (await pg.query<{ id: string }>(`select id from "user" where email = 'forgetful@example.com'`)).rows[0];
  // Verbatim mechanics from staffResetPassword (service.server.ts):
  const ctx = await auth.$context;
  const hash = await ctx.password.hash("new-password-456");
  await ctx.internalAdapter.updatePassword(user.id, hash);
  const sessions = await ctx.internalAdapter.listSessions(user.id);
  if (sessions.length) await ctx.internalAdapter.deleteSessions(sessions.map((s) => s.token));

  const withOld = await auth.handler(browserPost("/sign-in/email", { email: "forgetful@example.com", password: "old-password-123" }));
  assert.equal(withOld.status, 401, "the old password no longer works");
  const withNew = await auth.handler(browserPost("/sign-in/email", { email: "forgetful@example.com", password: "new-password-456" }));
  assert.equal(withNew.status, 200, await withNew.text());
  const oldSession = await auth.handler(
    new Request(`${PROD_ORIGIN}/api/auth/get-session`, {
      headers: { cookie: oldCookie as string, host: "sepehrhotel.vercel.app", "x-forwarded-proto": "https" },
    }),
  );
  assert.equal(await oldSession.json(), null, "the pre-reset session is gone");
});
