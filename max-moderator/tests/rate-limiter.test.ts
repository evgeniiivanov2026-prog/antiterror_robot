import { describe, expect, it } from 'vitest';
import { withRetry, MaxApiError } from '../src/max/errors.js';
import { ChatRateLimiter } from '../src/max/rate-limiter.js';

describe('chat deletion rate limiter', () => {
  it('allows at most two deletions per second in one chat', async () => {
    let now = 0;
    const limiter = new ChatRateLimiter({
      limitPerSecond: 2,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    const stamps: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      await limiter.acquire('chat');
      stamps.push(now);
    }

    for (const stamp of stamps) {
      const inWindow = stamps.filter((item) => stamp - item >= 0 && stamp - item < 1000);
      expect(inWindow.length).toBeLessThanOrEqual(2);
    }
    expect(stamps[2]! - stamps[0]!).toBeGreaterThanOrEqual(1000);
  });

  it('does not share the limit between chats', async () => {
    let now = 0;
    let slept = 0;
    const limiter = new ChatRateLimiter({
      limitPerSecond: 2,
      now: () => now,
      sleep: async (ms) => {
        slept += 1;
        now += ms;
      },
    });
    await limiter.acquire('a');
    await limiter.acquire('a');
    await limiter.acquire('b');
    expect(slept).toBe(0);
  });
});

describe('MAX API retry', () => {
  it('retries 429 and 5xx and does not retry 403', async () => {
    let attempts = 0;
    const value = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new MaxApiError(429, 'slow down', true);
        return 'ok';
      },
      { attempts: 3, baseDelayMs: 1, sleep: async () => undefined },
    );
    expect(value).toBe('ok');
    expect(attempts).toBe(3);

    await expect(
      withRetry(
        async () => {
          throw new MaxApiError(403, 'forbidden', false);
        },
        { attempts: 3, baseDelayMs: 1, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
