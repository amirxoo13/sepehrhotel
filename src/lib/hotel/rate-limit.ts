/**
 * In-process fixed-window rate limiter and sweep throttle. Pure: the clock is
 * injectable so the behaviour is unit-testable.
 *
 * Scope: ONE process. On a serverless platform every function instance has its
 * own limiter, so this bounds abuse per instance, not globally — it is a cheap
 * first line, not a substitute for edge rate limiting.
 */
type Bucket = { n: number; t: number };

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    /** Above this many tracked keys, expired buckets are swept on the next hit. */
    private readonly maxEntries = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Number of keys currently tracked (expired ones included until swept). */
  get size(): number {
    return this.buckets.size;
  }

  /**
   * Count one hit for `key`. Returns true while the key has made at most `max`
   * hits in the current `windowMs` window, false once it is over the limit.
   */
  hit(key: string, max: number, windowMs: number): boolean {
    const now = this.now();
    if (this.buckets.size >= this.maxEntries) this.sweep(windowMs, now);
    const current = this.buckets.get(key);
    if (!current || now - current.t > windowMs) {
      this.buckets.set(key, { n: 1, t: now });
      return true;
    }
    current.n += 1;
    return current.n <= max;
  }

  /** Drop every bucket whose window has passed. Never grows without bound. */
  sweep(windowMs: number, now = this.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.t > windowMs) this.buckets.delete(key);
    }
  }
}

/** True when at least `intervalMs` passed since `lastRunAt` (0 = never ran). */
export function shouldRunSweep(lastRunAt: number, now: number, intervalMs: number): boolean {
  return lastRunAt === 0 || now - lastRunAt >= intervalMs;
}
