import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isMigrationFile, migrationDecision, migrationName, pendingMigrations } from "./migration-plan.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied is not re-applied", () => {
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped", () => {
  assert.equal(isMigrationFile("notes"), false);
  assert.deepEqual(pendingMigrations(["notes", "README.md"], []), []);
});

test("the shipped migrations are numbered, unique and all .sql", () => {
  const names = readdirSync(join(projectRoot, "migrations")).filter(isMigrationFile);
  assert.ok(names.length >= 6);
  const numbers = names.map((n) => n.slice(0, 4));
  assert.equal(new Set(numbers).size, numbers.length, "duplicate migration number");
  assert.deepEqual(
    pendingMigrations(names, []).map((m) => m.name),
    [...names].sort(),
  );
});

test("the deploy-time migrator runs for production and local builds only", () => {
  const url = "postgresql://user:pw@host/db";
  assert.equal(migrationDecision({}).run, false, "no DATABASE_URL: nothing to migrate");
  assert.equal(migrationDecision({ DATABASE_URL: "   " }).run, false, "whitespace counts as unset");
  assert.equal(migrationDecision({ DATABASE_URL: url }).run, true, "local build with a database");
  assert.equal(migrationDecision({ DATABASE_URL: url, VERCEL_ENV: "production" }).run, true);
  // Vercel gives preview builds the production DATABASE_URL: a branch push must
  // not migrate the production schema.
  const preview = migrationDecision({ DATABASE_URL: url, VERCEL_ENV: "preview" });
  assert.equal(preview.run, false);
  assert.match(preview.reason, /preview build/);
  assert.equal(migrationDecision({ DATABASE_URL: url, VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "1" }).run, true);
});
