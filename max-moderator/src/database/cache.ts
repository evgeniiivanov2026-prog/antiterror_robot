import { Redis } from 'ioredis';
import type { Logger } from '../utils/logger.js';

export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export class MemoryKeyValue implements KeyValue {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const row = this.values.get(key);
    if (!row) return null;
    if (row.expiresAt !== null && row.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? this.now() + ttlSeconds * 1000 : null;
    this.values.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export class RedisKeyValue implements KeyValue {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(this.prefix(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const redisKey = this.prefix(key);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(redisKey, value, 'EX', ttlSeconds);
      return;
    }
    await this.redis.set(redisKey, value);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(this.prefix(key));
  }

  private prefix(key: string): string {
    return `maxmod:${key}`;
  }
}

export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times: number) {
      return Math.min(times * 1000, 15000);
    },
  });
  redis.on('error', (error: Error) => {
    logger.error({ err: error }, 'redis connection error');
  });
  return redis;
}

export class JsonCache {
  constructor(
    private readonly kv: KeyValue,
    private readonly logger: Logger,
  ) {}

  async remember<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
    revive: (value: T) => T,
  ): Promise<T> {
    try {
      const cached = await this.kv.get(key);
      if (cached) return revive(JSON.parse(cached) as T);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'cache read failed');
    }
    const loaded = await load();
    try {
      await this.kv.set(key, JSON.stringify(loaded), ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'cache write failed');
    }
    return loaded;
  }

  async invalidate(chatId: string): Promise<void> {
    await Promise.all(
      ['filters', 'links', 'settings', 'whitelist'].map(async (kind) => {
        try {
          await this.kv.del(`${kind}:${chatId}`);
        } catch (error) {
          this.logger.warn({ err: error, chatId, kind }, 'cache invalidation failed');
        }
      }),
    );
  }
}
