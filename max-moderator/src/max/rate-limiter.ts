export interface RateLimiter {
  acquire(key: string): Promise<void>;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Sliding window: at most `max` acquisitions per `windowMs` for a key.
 * The platform limit for deletions in one chat is 2 per second.
 */
export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: Clock = systemClock,
  ) {}

  async acquire(key: string): Promise<void> {
    for (;;) {
      const wait = this.reserve(key);
      if (wait <= 0) return;
      await this.clock.sleep(wait);
    }
  }

  private reserve(key: string): number {
    const now = this.clock.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
    if (recent.length >= this.max) {
      const oldest = recent[0] ?? now;
      this.hits.set(key, recent);
      return Math.max(oldest + this.windowMs - now, 1);
    }
    recent.push(now);
    this.hits.set(key, recent);
    return 0;
  }
}
