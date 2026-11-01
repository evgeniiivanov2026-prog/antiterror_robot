import type { Redis } from 'ioredis';
import type { SpamSnapshot, SpamTracker } from './spam-filter.service.js';

export class RedisSpamTracker implements SpamTracker {
  constructor(private readonly redis: Redis) {}

  async record(
    chatId: string,
    userId: string,
    fingerprint: string,
    now: number,
    windowMs: number,
  ): Promise<SpamSnapshot> {
    const key = `spam:${chatId}:${userId}`;
    const member = `${now}:${fingerprint}`;
    await this.redis.zremrangebyscore(key, 0, now - windowMs);
    await this.redis.zadd(key, now, member);
    await this.redis.pexpire(key, windowMs);
    const rows = await this.redis.zrangebyscore(key, now - windowMs, now);
    const identical = rows.filter((row) => row.slice(row.indexOf(':') + 1) === fingerprint).length;
    return { total: rows.length, identical };
  }

  async bumpStrike(chatId: string, userId: string, now: number): Promise<number> {
    void now;
    const key = `strike:${chatId}:${userId}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, 60 * 60);
    return count;
  }
}
