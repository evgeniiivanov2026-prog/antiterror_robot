export interface SlotResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  tryAcquireSlot(
    key: string,
    nowMs: number,
    windowMs: number,
    limit: number,
    member: string,
  ): Promise<SlotResult>;
  addWindowEvent(key: string, nowMs: number, windowMs: number, member: string): Promise<number>;
}

interface WindowEvent {
  score: number;
  member: string;
}

export class MemoryCacheStore implements CacheStore {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();
  private readonly windows = new Map<string, WindowEvent[]>();

  async get(key: string): Promise<string | null> {
    const row = this.values.get(key);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const row = this.counters.get(key);
    if (!row || row.expiresAt <= now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    row.value += 1;
    return row.value;
  }

  async tryAcquireSlot(
    key: string,
    nowMs: number,
    windowMs: number,
    limit: number,
  ): Promise<SlotResult> {
    const fresh = (this.windows.get(key) ?? []).filter((event) => event.score > nowMs - windowMs);
    if (fresh.length >= limit) {
      this.windows.set(key, fresh);
      const oldest = Math.min(...fresh.map((event) => event.score));
      return { allowed: false, retryAfterMs: Math.max(1, oldest + windowMs - nowMs + 1) };
    }
    fresh.push({ score: nowMs, member: `${nowMs}:${fresh.length}` });
    this.windows.set(key, fresh);
    return { allowed: true, retryAfterMs: 0 };
  }

  async addWindowEvent(
    key: string,
    nowMs: number,
    windowMs: number,
    member: string,
  ): Promise<number> {
    const fresh = (this.windows.get(key) ?? []).filter((event) => event.score > nowMs - windowMs);
    fresh.push({ score: nowMs, member });
    this.windows.set(key, fresh);
    return fresh.length;
  }
}
