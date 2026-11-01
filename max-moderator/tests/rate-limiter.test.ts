import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../src/cache/cache-store.js';
import { ChatDeletionRateLimiter } from '../src/max/rate-limiter.js';
import { isRetryableStatus } from '../src/max/retry.js';
import { ManualClock } from './harness.js';

describe('deletion rate limiter', () => {
  it('allows at most two deletions per second in one chat', async () => {
    const clock = new ManualClock(0);
    const limiter = new ChatDeletionRateLimiter(new MemoryCacheStore(), 2, clock);
    expect((await limiter.acquire('chat')).allowed).toBe(true);
    expect((await limiter.acquire('chat')).allowed).toBe(true);
    expect((await limiter.acquire('chat')).allowed).toBe(false);
    expect((await limiter.acquire('other')).allowed).toBe(true);
    clock.value = 1000;
    expect((await limiter.acquire('chat')).allowed).toBe(true);
  });
});

describe('retry policy', () => {
  it('retries only 429 and idempotent 5xx', () => {
    expect(isRetryableStatus(401, true)).toBe(false);
    expect(isRetryableStatus(403, true)).toBe(false);
    expect(isRetryableStatus(404, true)).toBe(false);
    expect(isRetryableStatus(429, false)).toBe(true);
    expect(isRetryableStatus(500, true)).toBe(true);
    expect(isRetryableStatus(500, false)).toBe(false);
  });
});
