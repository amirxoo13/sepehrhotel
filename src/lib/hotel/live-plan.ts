/**
 * Timing for the `/api/live` server-sent-events channel. Pure constants and
 * helpers shared by the server route and the client hook.
 *
 * The deployed app runs as a Vercel Function. Vercel terminates a function at
 * its maximum duration (300 s by default, and the hard ceiling on the Hobby
 * plan), and the client used to open one stream and never reconnect — so live
 * updates silently stopped five minutes after each page load while the
 * function polled the database every two seconds for the whole five minutes.
 * Each stream now ends itself well inside that limit and the client reconnects
 * with backoff.
 */

/** A stream ends itself after this long; the client reconnects. */
export const LIVE_STREAM_MAX_MS = 55_000;

/** How often the server checks the notifications table while a stream is open. */
export const LIVE_POLL_MS = 3_000;

/** Comment-line heartbeat so idle connections are not closed by proxies. */
export const LIVE_HEARTBEAT_MS = 15_000;

/** Upper bound on the reconnect delay. */
export const LIVE_RECONNECT_MAX_MS = 30_000;

/** True once a stream that started at `startedAt` should close. */
export function streamShouldEnd(startedAt: number, now: number): boolean {
  return now - startedAt >= LIVE_STREAM_MAX_MS;
}

/**
 * Delay before reconnect attempt number `attempt` (0-based). A stream that
 * ended normally reconnects at once; failures back off exponentially from one
 * second and cap at LIVE_RECONNECT_MAX_MS.
 */
export function nextReconnectDelay(attempt: number, endedNormally: boolean): number {
  if (endedNormally) return 0;
  const step = Math.max(0, Math.min(attempt, 5));
  return Math.min(LIVE_RECONNECT_MAX_MS, 1_000 * 2 ** step);
}
