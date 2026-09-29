import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowLimiter, shouldRunSweep } from "./rate-limit.ts";

test("a key is allowed max hits per window and refused afterwards", () => {
  let now = 1_000_000;
  const limiter = new FixedWindowLimiter(5000, () => now);
  for (let i = 0; i < 3; i += 1) assert.equal(limiter.hit("book:u1", 3, 60_000), true, `hit ${i + 1}`);
  assert.equal(limiter.hit("book:u1", 3, 60_000), false, "4th hit in the window is refused");
  now += 60_001;
  assert.equal(limiter.hit("book:u1", 3, 60_000), true, "a new window starts");
});

test("tracked keys are bounded: expired buckets are swept instead of growing forever", () => {
  // The previous implementation was a Map that was only ever written to, so
  // every user id ever seen stayed in memory for the life of the process.
  let now = 0;
  const limiter = new FixedWindowLimiter(100, () => now);
  for (let i = 0; i < 100; i += 1) limiter.hit(`user-${i}`, 5, 1_000);
  assert.equal(limiter.size, 100);
  now += 1_001; // every window has passed
  limiter.hit("user-new", 5, 1_000);
  assert.equal(limiter.size, 1, "only the live key remains after the sweep");
});

test("the expiry sweep throttle runs once per interval and always on first use", () => {
  assert.equal(shouldRunSweep(0, 5_000, 30_000), true);
  assert.equal(shouldRunSweep(5_000, 10_000, 30_000), false);
  assert.equal(shouldRunSweep(5_000, 35_000, 30_000), true);
});
