import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "pg-connection-string";
import { normalizeDatabaseUrl } from "./database-url.mjs";

const NEON = "postgresql://user:pass@ep-example-pooler.c-1.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

test("sslmode=require becomes verify-full and nothing else changes", () => {
  assert.equal(
    normalizeDatabaseUrl(NEON),
    "postgresql://user:pass@ep-example-pooler.c-1.us-east-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
  );
  assert.equal(normalizeDatabaseUrl("postgresql://u:p@h/db?a=1&sslmode=prefer"), "postgresql://u:p@h/db?a=1&sslmode=verify-full");
  assert.equal(normalizeDatabaseUrl("postgresql://u:p@h/db?sslmode=verify-ca"), "postgresql://u:p@h/db?sslmode=verify-full");
});

test("verify-full, disable and URLs without sslmode are left alone; blank is unset", () => {
  assert.equal(normalizeDatabaseUrl("postgresql://u:p@h/db?sslmode=verify-full"), "postgresql://u:p@h/db?sslmode=verify-full");
  assert.equal(normalizeDatabaseUrl("postgresql://u:p@h/db?sslmode=disable"), "postgresql://u:p@h/db?sslmode=disable");
  assert.equal(normalizeDatabaseUrl("postgresql://u:p@h/db"), "postgresql://u:p@h/db");
  assert.equal(normalizeDatabaseUrl("  "), undefined);
  assert.equal(normalizeDatabaseUrl(undefined), undefined);
});

test("pg parses the normalized URL without emitting its SSL-mode warning", async () => {
  // pg-connection-string warns at most once per process, so the normalized
  // URL is parsed first: had it warned, the original URL afterwards could not.
  const warnings = [];
  const onWarning = (warning) => warnings.push(String(warning.message));
  process.on("warning", onWarning);
  const after = parse(normalizeDatabaseUrl(NEON));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings.filter((w) => w.includes("SSL modes")).length, 0, "verify-full does not warn");
  const before = parse(NEON);
  await new Promise((resolve) => setImmediate(resolve));
  process.removeListener("warning", onWarning);
  assert.equal(warnings.filter((w) => w.includes("SSL modes")).length, 1, "the original sslmode=require warns");
  assert.equal(after.host, before.host);
  assert.equal(after.database, before.database);
  assert.equal(after.sslmode, "verify-full");
  assert.equal(before.sslmode, "require");
});
