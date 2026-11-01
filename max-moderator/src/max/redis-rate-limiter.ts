import type { Redis } from 'ioredis';
import type { RateLimiter } from './rate-limiter.js';
import { systemClock } from './rate-limiter.js';

const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  if oldest[2] then
    return oldest[2]
  end
  return now
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 0
`;

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async acquire(key: string): Promise<void> {
    for (;;) {
      const wait = await this.reserve(key);
      if (wait <= 0) return;
      await systemClock.sleep(wait);
    }
  }

  private async reserve(key: string): Promise<number> {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(16).slice(2)}`;
    const oldest = await this.redis.eval(
      SLIDING_WINDOW,
      1,
      `ratelimit:${key}`,
      String(now),
      String(this.windowMs),
      String(this.max),
      member,
    );
    if (oldest === 0 || oldest === '0') return 0;
    const score = Number(oldest);
    if (!Number.isFinite(score)) return this.windowMs;
    return Math.max(score + this.windowMs - now, 1);
  }
}
