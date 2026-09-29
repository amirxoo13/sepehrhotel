import assert from "node:assert/strict";
import test from "node:test";
import { resolveDbSource } from "./db-source.ts";

test("a configured DATABASE_URL selects Neon everywhere", () => {
  assert.equal(resolveDbSource({ DATABASE_URL: "postgresql://u:p@h/db" }), "neon");
  assert.equal(resolveDbSource({ DATABASE_URL: "postgresql://u:p@h/db", VERCEL_ENV: "production" }), "neon");
});

test("without a database, preview and local runs use the embedded PGLite", () => {
  assert.equal(resolveDbSource({}), "pglite");
  assert.equal(resolveDbSource({ DATABASE_URL: "  " }), "pglite");
  assert.equal(resolveDbSource({ VERCEL_ENV: "preview" }), "pglite");
});

test("production refuses the in-memory fallback instead of silently losing writes", () => {
  assert.throws(() => resolveDbSource({ VERCEL_ENV: "production" }), /DATABASE_URL is not set in the production environment/);
  assert.throws(() => resolveDbSource({ DATABASE_URL: "", VERCEL_ENV: "production" }));
});
