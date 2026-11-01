import { MaxError, type Api } from '@maxhub/max-bot-api';
import type { Logger } from '../utils/logger.js';
import { errorMessage, isRetryableStatus, MaxApiError, withRetry } from './errors.js';
import type { BotMembership, MaxGateway, MemberSnapshot, RecentMessage } from './gateway.js';
import { toApiId } from './gateway.js';

function alreadyDeleted(message: string): boolean {
  return /not found|не найден|unknown message|message.removed/i.test(message);
}

function asMember(member: {
  user_id: number;
  is_admin?: boolean;
  is_owner?: boolean;
  is_bot?: boolean;
  permissions?: string[] | null;
}): MemberSnapshot {
  return {
    userId: String(member.user_id),
    isAdmin: Boolean(member.is_admin || member.is_owner),
    isOwner: Boolean(member.is_owner),
    isBot: Boolean(member.is_bot),
  };
}

/**
 * Adapter over `@maxhub/max-bot-api` 1.0.2.
 *
 * Message deletion is `api.raw.messages.delete`, which issues
 * `DELETE /messages?message_id=` with the token in the Authorization header.
 * The older guide shape `api.raw.delete(method, options)` is not present on
 * RawApi in this version; the namespaced raw client is the supported call.
 *
 * Member removal is the documented `DELETE /chats/{chatId}/members`.
 * MAX does not document a mute method. Mute is applied locally by
 * SanctionService and enforced by deleting later messages.
 */
export class MaxBotGateway implements MaxGateway {
  constructor(
    private readonly api: Api,
    private readonly logger: Logger,
  ) {}

  async deleteMessage(messageId: string): Promise<void> {
    await withRetry(() => this.deleteOnce(messageId), {
      attempts: 3,
      baseDelayMs: 200,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
  }

  async sendChatMessage(chatId: string, text: string): Promise<void> {
    await this.api.sendMessageToChat(toApiId(chatId), text.slice(0, 4000));
  }

  async sendUserMessage(userId: string, text: string): Promise<void> {
    await this.api.sendMessageToUser(toApiId(userId), text.slice(0, 4000));
  }

  async getMember(chatId: string, userId: string): Promise<MemberSnapshot | null> {
    try {
      const response = await this.api.getChatMembers(toApiId(chatId), {
        user_ids: [toApiId(userId)],
      });
      const member = response.members[0];
      return member ? asMember(member) : null;
    } catch (error) {
      this.logger.warn({ err: error, chatId, userId }, 'failed to load chat member');
      return null;
    }
  }

  async getBotMembership(chatId: string): Promise<BotMembership | null> {
    try {
      const member = await this.api.getChatMembership(toApiId(chatId));
      const permissions = member.permissions ?? [];
      return {
        isAdmin: Boolean(member.is_admin || member.is_owner),
        permissions: [...permissions],
      };
    } catch (error) {
      this.logger.warn({ err: error, chatId }, 'failed to load bot membership');
      return null;
    }
  }

  async getAdmins(chatId: string): Promise<MemberSnapshot[]> {
    try {
      const response = await this.api.getChatAdmins(toApiId(chatId));
      return response.members.map((member) => asMember(member));
    } catch (error) {
      this.logger.warn({ err: error, chatId }, 'failed to load chat admins');
      return [];
    }
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    const result = await this.api.raw.chats.removeChatMember({
      chat_id: toApiId(chatId),
      user_id: toApiId(userId),
      block: false,
    });
    if (!result.success) {
      throw new MaxApiError(200, result.message ?? 'remove member failed', false);
    }
  }

  async listRecentMessages(chatId: string, count: number): Promise<RecentMessage[]> {
    const response = await this.api.getMessages(toApiId(chatId), {
      count: Math.min(Math.max(count, 1), 100),
    });
    return response.messages.map((message) => {
      const recent: RecentMessage = { messageId: message.body.mid };
      if (message.sender?.user_id !== undefined) recent.senderId = String(message.sender.user_id);
      return recent;
    });
  }

  private async deleteOnce(messageId: string): Promise<void> {
    try {
      const result = await this.api.raw.messages.delete({ message_id: messageId });
      if (!result.success) {
        const message = result.message ?? 'delete failed';
        if (alreadyDeleted(message)) return;
        throw new MaxApiError(200, message, false);
      }
    } catch (error) {
      if (error instanceof MaxApiError) throw error;
      if (error instanceof MaxError) {
        if (error.status === 404 || alreadyDeleted(error.description)) return;
        throw new MaxApiError(
          error.status,
          error.description || errorMessage(error),
          isRetryableStatus(error.status),
        );
      }
      throw new MaxApiError(0, errorMessage(error), false);
    }
  }
}
