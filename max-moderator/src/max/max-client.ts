import { Api, Bot, MaxError } from '@maxhub/max-bot-api';
import type { Message } from '@maxhub/max-bot-api/types';
import { MaxApiError, isRetryableStatus, withRetry } from './errors.js';
import type { ChatMemberInfo, MaxGateway, RecentMessage } from './gateway.js';
import { systemClock } from './rate-limiter.js';

const DELETE_PERMISSIONS = new Set([
  'write',
  'delete',
  'delete_message',
  'post_edit_delete_message',
]);

export function createMaxBot(token: string, baseUrl: string): Bot {
  return new Bot(token, { clientOptions: { baseUrl } });
}

export class LibraryMaxGateway implements MaxGateway {
  constructor(private readonly api: Api) {}

  async deleteMessage(messageId: string): Promise<void> {
    await withRetry(
      async () => {
        try {
          const result = await this.api.deleteMessage(messageId);
          if (result.success === false) {
            throw new MaxApiError(200, result.message || 'delete rejected', false);
          }
        } catch (error) {
          const mapped = mapError(error);
          if (mapped.status === 404) return;
          throw mapped;
        }
      },
      {
        attempts: 3,
        baseDelayMs: 200,
        sleep: systemClock.sleep,
        retryable: (error) => error instanceof MaxApiError && error.retryable,
      },
    );
  }

  async sendChatMessage(chatId: string, text: string): Promise<void> {
    await this.api.sendMessageToChat(asId(chatId), clip(text));
  }

  async sendUserMessage(userId: string, text: string): Promise<void> {
    await this.api.sendMessageToUser(asId(userId), clip(text));
  }

  async getAdminIds(chatId: string): Promise<string[]> {
    const response = await this.api.getChatAdmins(asId(chatId));
    return response.members
      .filter((member) => member.is_admin || member.is_owner)
      .map((member) => String(member.user_id));
  }

  async getMembers(chatId: string, userIds: string[]): Promise<ChatMemberInfo[]> {
    const ids = userIds.map(asId);
    const response = await this.api.getChatMembers(
      asId(chatId),
      ids.length > 0 ? { user_ids: ids } : {},
    );
    return response.members.map((member) => ({
      userId: String(member.user_id),
      isOwner: member.is_owner,
      isAdmin: member.is_admin,
      isBot: member.is_bot,
      permissions: member.permissions ?? [],
    }));
  }

  async getBotPermissions(chatId: string): Promise<string[]> {
    const membership = await this.api.getChatMembership(asId(chatId));
    return membership.permissions ?? [];
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    const result = await this.api.removeChatMember(asId(chatId), asId(userId));
    if (result.success === false) {
      throw new MaxApiError(200, result.message || 'remove member rejected', false);
    }
  }

  async listRecentMessages(chatId: string, count: number): Promise<RecentMessage[]> {
    const response = await this.api.getMessages(asId(chatId), { count });
    return response.messages.map(toRecent);
  }
}

export function canDeleteMessages(permissions: string[]): boolean {
  return permissions.some((permission) => DELETE_PERMISSIONS.has(permission));
}

function toRecent(message: Message): RecentMessage {
  return {
    messageId: message.body.mid,
    userId: message.sender ? String(message.sender.user_id) : null,
  };
}

function mapError(error: unknown): MaxApiError {
  if (error instanceof MaxApiError) return error;
  if (error instanceof MaxError) {
    return new MaxApiError(
      error.status,
      error.description || error.message,
      isRetryableStatus(error.status),
    );
  }
  const message = error instanceof Error ? error.message : 'MAX API error';
  return new MaxApiError(0, message, false);
}

function asId(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new MaxApiError(400, 'Некорректный идентификатор', false);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new MaxApiError(400, 'Идентификатор вне безопасного диапазона', false);
  return parsed;
}

function clip(text: string): string {
  return text.length <= 4000 ? text : `${text.slice(0, 3990)}…`;
}
