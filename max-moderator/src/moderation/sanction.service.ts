import type { KeyValue } from '../database/cache.js';
import { errorMessage } from '../max/errors.js';
import type { MaxGateway } from '../max/gateway.js';
import type { Logger } from '../utils/logger.js';

/**
 * MAX Bot API documents member removal (`DELETE /chats/{chatId}/members`)
 * but does not document a mute endpoint. Mute is stored with a TTL and
 * enforced by deleting the user's next messages until it expires.
 */
export class SanctionService {
  constructor(
    private readonly kv: KeyValue,
    private readonly gateway: MaxGateway,
    private readonly logger: Logger,
    private readonly now: () => number,
  ) {}

  async mute(chatId: string, userId: string, seconds: number): Promise<void> {
    const safeSeconds = Math.max(1, Math.min(seconds, 60 * 60 * 24 * 7));
    const until = this.now() + safeSeconds * 1000;
    await this.kv.set(this.muteKey(chatId, userId), String(until), safeSeconds);
  }

  async isMuted(chatId: string, userId: string): Promise<boolean> {
    const raw = await this.kv.get(this.muteKey(chatId, userId));
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && until > this.now();
  }

  async kick(chatId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.gateway.removeMember(chatId, userId);
      return { ok: true };
    } catch (error) {
      this.logger.error({ err: error, chatId, userId }, 'kick failed');
      return { ok: false, error: errorMessage(error) };
    }
  }

  private muteKey(chatId: string, userId: string): string {
    return `mute:${chatId}:${userId}`;
  }
}
