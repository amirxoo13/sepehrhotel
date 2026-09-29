/**
 * Which database backend the process must use, decided from the environment.
 *
 * Pure and dependency-free so it can be unit-tested; `src/lib/db.ts` applies
 * it at import time.
 */
export type DbSource = "neon" | "pglite";

export type DbSourceEnv = {
  DATABASE_URL?: string;
  VERCEL_ENV?: string;
};

/**
 * `neon` when `DATABASE_URL` is set (whitespace counts as unset — an easy
 * misconfiguration in deploy UIs), otherwise the embedded in-memory PGLite.
 *
 * PGLite lives inside one process and forgets everything when that process
 * ends. On a serverless platform that means every function instance would run
 * its own empty database and every write would vanish, while the site kept
 * answering 200. Production therefore refuses to start without a real database
 * instead of failing silently.
 */
export function resolveDbSource(env: DbSourceEnv): DbSource {
  const url = env.DATABASE_URL?.trim();
  if (url) return "neon";
  if (env.VERCEL_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set in the production environment. Refusing the in-memory PGLite fallback: " +
        "each server instance would keep its own empty database and silently lose every write.",
    );
  }
  return "pglite";
}
