import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_DEV_ORIGINS, resolveBaseUrl, resolveSecret, resolveTrustedOrigins } from "./config.ts";

const PROD = "https://sepehrhotel.vercel.app";

test("the public origin comes from BETTER_AUTH_URL; production refuses to start without it", () => {
  assert.equal(resolveBaseUrl({ BETTER_AUTH_URL: `${PROD}/` }), PROD);
  assert.equal(resolveBaseUrl({}), "http://localhost:8080");
  assert.throws(() => resolveBaseUrl({ VERCEL_ENV: "production" }), /BETTER_AUTH_URL must be set/);
});

test("trusted origins cover the site, its Vercel hosts, extra domains and local dev", () => {
  const origins = resolveTrustedOrigins({
    BETTER_AUTH_URL: PROD,
    VERCEL_URL: "sepehrhotel-abc123.vercel.app",
    VERCEL_BRANCH_URL: "sepehrhotel-git-main-team.vercel.app",
    EXTRA_TRUSTED_ORIGINS: " https://sepehrhotel.ir/ , https://www.sepehrhotel.ir",
  });
  assert.equal(origins[0], PROD);
  assert.ok(origins.includes("https://sepehrhotel-abc123.vercel.app"));
  assert.ok(origins.includes("https://sepehrhotel-git-main-team.vercel.app"));
  assert.ok(origins.includes("https://sepehrhotel.ir"));
  assert.ok(origins.includes("https://www.sepehrhotel.ir"));
  for (const local of LOCAL_DEV_ORIGINS) assert.ok(origins.includes(local));
  assert.equal(new Set(origins).size, origins.length, "no duplicates");
});

test("the signing secret is required in production and minted locally", () => {
  assert.equal(resolveSecret({ BETTER_AUTH_SECRET: " abc " }, () => "x"), "abc");
  assert.equal(resolveSecret({}, () => "minted"), "minted");
  assert.throws(() => resolveSecret({ VERCEL_ENV: "production" }, () => "minted"), /BETTER_AUTH_SECRET must be set/);
});
