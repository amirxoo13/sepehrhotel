#!/usr/bin/env node
/**
 * Copy PGLite's WebAssembly runtime into the Vercel server function.
 *
 * `src/lib/db.ts` only opens PGLite when `DATABASE_URL` is unset, so a deploy
 * that has a real database never touches these files. They weigh about 16 MB
 * (pglite.wasm 9.7 MB + pglite.data 6.1 MB), which only slows every cold start
 * of the production function. Copy them only for a build that will actually
 * run on the embedded database.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const src = "node_modules/@electric-sql/pglite/dist";
const dest = ".vercel/output/functions/__server.func/_libs";

/** Whether the build needs the embedded database at runtime. */
export function needsPglite(env) {
  return !(env.DATABASE_URL && String(env.DATABASE_URL).trim());
}

if (!needsPglite(process.env)) {
  console.log("[copy-pglite] DATABASE_URL is set — skipping the 16 MB PGLite runtime.");
} else if (!existsSync(dest)) {
  console.log(`[copy-pglite] ${dest} not found — nothing to copy.`);
} else {
  mkdirSync(dest, { recursive: true });
  for (const name of FILES) copyFileSync(join(src, name), join(dest, name));
  console.log(`[copy-pglite] copied ${FILES.join(", ")} into ${dest}`);
}
