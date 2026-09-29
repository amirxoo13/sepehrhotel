/**
 * Auth configuration derived from the environment. Pure and dependency-free so
 * it can be unit-tested; `server.ts` applies it.
 */
export type AuthEnv = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  EXTRA_TRUSTED_ORIGINS?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
};

/** Local `npm run dev` origins (the dev server listens on port 8080). */
export const LOCAL_DEV_ORIGINS: readonly string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];

const trim = (value: string | undefined): string | undefined => {
  const v = value?.trim();
  return v ? v : undefined;
};

/**
 * The public origin Better Auth runs at. `BETTER_AUTH_URL` when set; a
 * production deployment without it refuses to start (every credentialed
 * request from the site would otherwise be rejected as a foreign origin);
 * elsewhere the local dev server.
 */
export function resolveBaseUrl(env: AuthEnv): string {
  const explicit = trim(env.BETTER_AUTH_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  if (env.VERCEL_ENV === "production") {
    throw new Error("BETTER_AUTH_URL must be set in the production environment (e.g. https://sepehrhotel.vercel.app)");
  }
  return "http://localhost:8080";
}

/**
 * Origins accepted on credentialed auth POSTs (sign-up, sign-in, sign-out …).
 * The base URL, this deployment's own Vercel hosts (so preview deployments can
 * sign in too), any extra origins the owner lists, and the local dev origins.
 */
export function resolveTrustedOrigins(env: AuthEnv): string[] {
  const origins = new Set<string>([resolveBaseUrl(env)]);
  for (const host of [trim(env.VERCEL_URL), trim(env.VERCEL_BRANCH_URL)]) {
    if (host) origins.add(`https://${host}`);
  }
  for (const origin of (env.EXTRA_TRUSTED_ORIGINS ?? "").split(",")) {
    const o = origin.trim();
    if (o) origins.add(o.replace(/\/+$/, ""));
  }
  for (const origin of LOCAL_DEV_ORIGINS) origins.add(origin);
  return [...origins];
}

/**
 * The session signing secret. Required in production: a per-process random
 * secret would differ between function instances and invalidate every
 * session on each cold start. Locally a caller-provided fallback is used.
 */
export function resolveSecret(env: AuthEnv, fallback: () => string): string {
  const explicit = trim(env.BETTER_AUTH_SECRET);
  if (explicit) return explicit;
  if (env.VERCEL_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET must be set in the production environment");
  }
  return fallback();
}
