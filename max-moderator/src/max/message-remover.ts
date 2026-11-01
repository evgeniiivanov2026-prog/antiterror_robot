import type { Sleep } from '../utils/clock.js';
import { logger } from '../utils/logger.js';
import type { MaxClient } from './max-client.js';
import { MaxApiError } from './max-client.js';
import type { ChatDeletionRateLimiter } from './rate-limiter.js';
import { backoffMs, isRetryableStatus } from './retry.js';

export interface RemovalResult {
  ok: boolean;
  status: number;
  alreadyGone?: boolean;
}

const MAX_ATTEMPTS = 5;

/**
 * Per-chat deletion queue. The platform allows at most two deletions per second
 * in one chat (DELETE /messages). Jobs for different chats proceed independently.
 */
export class MessageRemover {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly client: MaxClient,
    private readonly limiter: ChatDeletionRateLimiter,
    private readonly sleep: Sleep,
  ) {}

  remove(chatId: string, messageId: string): Promise<RemovalResult> {
    const previous = this.tails.get(chatId) ?? Promise.resolve();
    const current = previous.then(() => this.attempt(chatId, messageId));
    this.tails.set(
      chatId,
      current.then(
        () => undefined,
        () => undefined,
      ),
    );
    return current;
  }

  private async attempt(chatId: string, messageId: string): Promise<RemovalResult> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const slot = await this.limiter.acquire(chatId);
      if (!slot.allowed) {
        await this.sleep(slot.retryAfterMs);
        continue;
      }
      try {
        await this.client.deleteMessage(messageId);
        return { ok: true, status: 200 };
      } catch (error) {
        const wrapped = error instanceof MaxApiError ? error : new MaxApiError(0, 'delete failed');
        if (wrapped.status === 404) return { ok: true, status: 404, alreadyGone: true };
        if (!isRetryableStatus(wrapped.status, true)) {
          logger.warn({ chatId, messageId, status: wrapped.status }, 'message delete rejected');
          return { ok: false, status: wrapped.status };
        }
        logger.warn({ chatId, messageId, status: wrapped.status, attempt }, 'message delete retry');
        await this.sleep(backoffMs(attempt));
      }
    }
    return { ok: false, status: 429 };
  }
}
