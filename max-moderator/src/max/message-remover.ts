import type { Redis } from 'ioredis';
import type { AppLogger } from '../utils/logger.js';
import type { RateLimiter } from './rate-limiter.js';

export interface DeletionJob {
  chatId: string;
  messageId: string;
  reason: string;
}

export interface MessageRemover {
  enqueue(job: DeletionJob): void;
  drain(): Promise<void>;
}

export class QueuedMessageRemover implements MessageRemover {
  private readonly seen = new Set<string>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly limiter: RateLimiter,
    private readonly deleter: (job: DeletionJob) => Promise<void>,
    private readonly onResult: (job: DeletionJob, error?: unknown) => Promise<void>,
  ) {}

  enqueue(job: DeletionJob): void {
    const key = `${job.chatId}:${job.messageId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const previous = this.tails.get(job.chatId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await this.limiter.acquire(job.chatId);
        try {
          await this.deleter(job);
          await this.onResult(job);
        } catch (error) {
          try {
            await this.onResult(job, error);
          } catch {
            // The queue keeps going even if the result callback fails.
          }
        }
      });
    this.tails.set(job.chatId, next);
  }

  async drain(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }
}

const QUEUE_KEY = 'moderation:deletions';

export class RedisMessageRemover implements MessageRemover {
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly limiter: RateLimiter,
    private readonly deleter: (job: DeletionJob) => Promise<void>,
    private readonly onResult: (job: DeletionJob, error?: unknown) => Promise<void>,
    private readonly logger: AppLogger,
  ) {}

  enqueue(job: DeletionJob): void {
    void this.redis.lpush(QUEUE_KEY, JSON.stringify(job)).catch((error: unknown) => {
      this.logger.error(
        { err: error instanceof Error ? error.message : 'enqueue' },
        'deletion enqueue failed',
      );
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  async drain(): Promise<void> {
    for (;;) {
      const raw = await this.redis.rpop(QUEUE_KEY);
      if (!raw) return;
      await this.consume(raw);
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const raw = await this.redis.brpop(QUEUE_KEY, 1);
        const payload = raw?.[1];
        if (!payload) continue;
        await this.consume(payload);
      } catch (error) {
        this.logger.error(
          { err: error instanceof Error ? error.message : 'queue' },
          'deletion loop failed',
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  private async consume(raw: string): Promise<void> {
    let job: DeletionJob;
    try {
      job = JSON.parse(raw) as DeletionJob;
    } catch {
      this.logger.warn({ raw: raw.slice(0, 80) }, 'dropped malformed deletion job');
      return;
    }
    if (!job.chatId || !job.messageId) return;
    const dedupe = await this.redis.set(
      `deldone:${job.chatId}:${job.messageId}`,
      '1',
      'EX',
      86_400,
      'NX',
    );
    if (dedupe !== 'OK') return;
    try {
      await this.limiter.acquire(job.chatId);
      await this.deleter(job);
      await this.onResult(job);
    } catch (error) {
      await this.onResult(job, error);
    }
  }
}
