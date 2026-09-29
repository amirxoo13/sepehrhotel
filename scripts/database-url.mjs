/**
 * The Neon connection string carries `sslmode=require`. `pg` 8.16+ treats
 * `prefer`, `require` and `verify-ca` exactly like `verify-full` (full
 * certificate verification), but prints a "SECURITY WARNING" to stderr on
 * every process start for any of them — which Vercel then shows as an error
 * line on every cold start. Spelling out `verify-full` keeps the same
 * behaviour and drops the warning. Used wherever a Pool is opened (`src/lib/db.ts`,
 * `src/lib/auth/server.ts`, `scripts/migrate.mjs`).
 *
 * @param {string | undefined} url
 * @returns {string | undefined} the same URL with `sslmode=verify-full`, or `undefined` when unset/blank
 */
export function normalizeDatabaseUrl(url) {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
