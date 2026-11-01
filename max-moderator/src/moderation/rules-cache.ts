import type { CacheStore } from '../cache/cache-store.js';
import type { LinkRuleRecord, WordFilterRecord } from '../domain/types.js';

const TTL_SECONDS = 60;

export class RulesCache {
  constructor(private readonly store: CacheStore) {}

  async getFilters(
    chatId: string,
    load: () => Promise<WordFilterRecord[]>,
  ): Promise<WordFilterRecord[]> {
    return this.read(`rules:filters:${chatId}`, load);
  }

  async getLinks(chatId: string, load: () => Promise<LinkRuleRecord[]>): Promise<LinkRuleRecord[]> {
    return this.read(`rules:links:${chatId}`, load);
  }

  async invalidate(chatId: string): Promise<void> {
    await this.store.del(`rules:filters:${chatId}`);
    await this.store.del(`rules:links:${chatId}`);
    await this.store.del(`rules:settings:${chatId}`);
    await this.store.del(`admins:${chatId}`);
  }

  async remember(key: string, ttlSeconds: number): Promise<void> {
    await this.store.set(key, '1', ttlSeconds);
  }

  async has(key: string): Promise<boolean> {
    return (await this.store.get(key)) === '1';
  }

  private async read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = await this.store.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        await this.store.del(key);
      }
    }
    const value = await load();
    await this.store.set(key, JSON.stringify(value), TTL_SECONDS);
    return value;
  }
}
