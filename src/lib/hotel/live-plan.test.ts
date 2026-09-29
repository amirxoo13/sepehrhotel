import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_RECONNECT_MAX_MS, LIVE_STREAM_MAX_MS, nextReconnectDelay, streamShouldEnd } from "./live-plan.ts";

test("a live stream ends well inside the Vercel function limit (300 s default and Hobby maximum)", () => {
  assert.ok(LIVE_STREAM_MAX_MS < 300_000 / 2, "leaves ample margin before the platform terminates the function");
  assert.equal(streamShouldEnd(0, LIVE_STREAM_MAX_MS - 1), false);
  assert.equal(streamShouldEnd(0, LIVE_STREAM_MAX_MS), true);
});

test("a normally ended stream reconnects at once; failures back off and cap", () => {
  assert.equal(nextReconnectDelay(7, true), 0);
  assert.equal(nextReconnectDelay(0, false), 1_000);
  assert.equal(nextReconnectDelay(1, false), 2_000);
  assert.equal(nextReconnectDelay(2, false), 4_000);
  assert.equal(nextReconnectDelay(9, false), LIVE_RECONNECT_MAX_MS);
});
