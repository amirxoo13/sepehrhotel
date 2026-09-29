// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Whether the deploy-time migrator may run, from the process environment.
 *
 * Vercel builds every branch with the same project variables, so a preview
 * deployment of any branch would otherwise migrate the PRODUCTION database
 * during its build. Only a production build applies migrations; a preview
 * build must opt in with `MIGRATE_ON_PREVIEW=1` (for example when the preview
 * points at its own Neon branch). Local builds without `VERCEL_ENV` behave as
 * before.
 * @param {Record<string, string | undefined>} env
 * @returns {{ run: boolean, reason: string }}
 */
export function migrationDecision(env) {
  const url = env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    return { run: false, reason: "DATABASE_URL not set — skipping (the PGLite fallback migrates itself)." };
  }
  if (env.VERCEL_ENV === "preview" && env.MIGRATE_ON_PREVIEW !== "1") {
    return {
      run: false,
      reason:
        "preview build — migrations are applied by production builds only " +
        "(set MIGRATE_ON_PREVIEW=1 to migrate from a preview that has its own database).",
    };
  }
  return { run: true, reason: env.VERCEL_ENV ? `${env.VERCEL_ENV} build` : "local build" };
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
