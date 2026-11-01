import { Redis } from 'ioredis';
import type { CacheStore, SlotResult } from './cache-store.js';

const ACQUIRE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
local limit = tonumber(ARGV[3])
local now = tonumber(ARGV[2])
local window = tonumber(ARGV[4])
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2])
  return oldestScore + window - now + 1
end
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('PEXPIRE', KEYS[1], window * 2)
return 0
`;

const WINDOW_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return redis.call('ZCARD', KEYS[1])
`;

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
}

export class RedisCacheStore implements CacheStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.redis.incr(key);
    if (value === 1) await this.redis.expire(key, ttlSeconds);
    return value;
  }

  async tryAcquireSlot(
    key: string,
    nowMs: number,
    windowMs: number,
    limit: number,
    member: string,
  ): Promise<SlotResult> {
    const result = await this.redis.eval(
      ACQUIRE_LUA,
      1,
      key,
      String(nowMs - windowMs),
      String(nowMs),
      String(limit),
      String(windowMs),
      member,
    );
    const retryAfterMs = Number(result);
    if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs };
  }

  async addWindowEvent(
    key: string,
    nowMs: number,
    windowMs: number,
    member: string,
  ): Promise<number> {
    const result = await this.redis.eval(
      WINDOW_LUA,
      1,
      key,
      String(nowMs - windowMs),
      String(nowMs),
      member,
      String(windowMs * 2),
    );
    return Number(result);
  }
}
