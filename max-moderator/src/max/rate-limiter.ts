import type { CacheStore } from '../cache/cache-store.js';
import type { Clock } from '../utils/clock.js';
import type { SlotResult } from '../cache/cache-store.js';

export class ChatDeletionRateLimiter {
  constructor(
    private readonly store: CacheStore,
    private readonly limit: number,
    private readonly clock: Clock,
  ) {}

  acquire(chatId: string): Promise<SlotResult> {
    const now = this.clock.now();
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    return this.store.tryAcquireSlot(`rate:del:${chatId}`, now, 1000, this.limit, member);
  }
}
