import type { Logger } from '../utils/logger.js';
import { errorMessage } from './errors.js';
import type { MaxGateway } from './gateway.js';
import type { ChatRateLimiter } from './rate-limiter.js';

export interface RemoveResult {
  ok: boolean;
  duplicate: boolean;
  error?: string;
}

export class MessageRemover {
  private readonly pending = new Set<string>();
  private readonly removed = new Set<string>();

  constructor(
    private readonly gateway: MaxGateway,
    private readonly limiter: ChatRateLimiter,
    private readonly logger: Logger,
  ) {}

  async remove(chatId: string, messageId: string): Promise<RemoveResult> {
    const key = `${chatId}:${messageId}`;
    if (this.removed.has(key) || this.pending.has(key)) {
      return { ok: true, duplicate: true };
    }
    this.pending.add(key);
    try {
      await this.limiter.acquire(chatId);
      await this.gateway.deleteMessage(messageId);
      this.removed.add(key);
      if (this.removed.size > 5000) {
        const first = this.removed.values().next().value;
        if (first) this.removed.delete(first);
      }
      return { ok: true, duplicate: false };
    } catch (error) {
      this.logger.error({ err: error, chatId, messageId }, 'message delete failed');
      return { ok: false, duplicate: false, error: errorMessage(error) };
    } finally {
      this.pending.delete(key);
    }
  }
}
