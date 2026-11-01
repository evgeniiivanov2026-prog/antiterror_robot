import { MaxError, type Api } from '@maxhub/max-bot-api';
import type { PlatformAdmin, RecentMessage } from '../domain/types.js';
import { logger } from '../utils/logger.js';
import { toSafeInteger } from '../utils/ids.js';
import type { Sleep } from '../utils/clock.js';
import { systemSleep } from '../utils/clock.js';
import { backoffMs, isRetryableStatus } from './retry.js';

export class MaxApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'MaxApiError';
  }
}

export interface MaxClient {
  deleteMessage(messageId: string): Promise<void>;
  sendToChat(chatId: string, text: string): Promise<void>;
  sendToUser(userId: string, text: string): Promise<void>;
  getAdmins(chatId: string): Promise<PlatformAdmin[]>;
  getRecentMessages(chatId: string, count: number): Promise<RecentMessage[]>;
  removeMember(chatId: string, userId: string, block: boolean): Promise<void>;
  setMyCommands(commands: Array<{ name: string; description: string }>): Promise<void>;
}

const MAX_ATTEMPTS = 4;

function asMaxError(error: unknown): MaxApiError {
  if (error instanceof MaxApiError) return error;
  if (error instanceof MaxError) {
    return new MaxApiError(error.status, error.description || error.message, error.code);
  }
  if (error instanceof Error) return new MaxApiError(0, error.message);
  return new MaxApiError(0, 'Unknown MAX API error');
}

async function withRetry<T>(
  operation: () => Promise<T>,
  idempotent: boolean,
  sleep: Sleep,
): Promise<T> {
  let last: MaxApiError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const wrapped = asMaxError(error);
      last = wrapped;
      if (!isRetryableStatus(wrapped.status, idempotent) || attempt === MAX_ATTEMPTS - 1) {
        throw wrapped;
      }
      await sleep(backoffMs(attempt));
    }
  }
  throw last ?? new MaxApiError(0, 'MAX API retry exhausted');
}

export function createLibraryMaxClient(api: Api, sleep: Sleep = systemSleep): MaxClient {
  return {
    async deleteMessage(messageId) {
      await withRetry(
        async () => {
          const result = await api.deleteMessage(messageId);
          if (!result.success) {
            const message = result.message || 'delete failed';
            if (/not found|уже удал/i.test(message)) return;
            throw new MaxApiError(200, message);
          }
        },
        true,
        sleep,
      );
    },
    async sendToChat(chatId, text) {
      const chat_id = toSafeInteger(chatId, 'chatId');
      await withRetry(
        async () => {
          await api.sendMessageToChat(chat_id, text.slice(0, 4000));
        },
        false,
        sleep,
      );
    },
    async sendToUser(userId, text) {
      const user_id = toSafeInteger(userId, 'userId');
      await withRetry(
        async () => {
          await api.sendMessageToUser(user_id, text.slice(0, 4000));
        },
        false,
        sleep,
      );
    },
    async getAdmins(chatId) {
      const chat_id = toSafeInteger(chatId, 'chatId');
      const response = await withRetry(() => api.getChatAdmins(chat_id), true, sleep);
      if (response.marker) {
        logger.warn({ chatId }, 'admin list is paginated; only the first page is used');
      }
      return response.members.map((member) => ({
        userId: String(member.user_id),
        isOwner: member.is_owner,
        isAdmin: member.is_admin,
        isBot: member.is_bot,
        permissions: member.permissions ?? [],
      }));
    },
    async getRecentMessages(chatId, count) {
      const chat_id = toSafeInteger(chatId, 'chatId');
      const response = await withRetry(() => api.getMessages(chat_id, { count }), true, sleep);
      return response.messages
        .map((message) => ({
          messageId: message.body?.mid ?? '',
          userId: message.sender?.user_id ? String(message.sender.user_id) : null,
        }))
        .filter((message) => message.messageId.length > 0);
    },
    async removeMember(chatId, userId, block) {
      const chat_id = toSafeInteger(chatId, 'chatId');
      const user_id = toSafeInteger(userId, 'userId');
      await withRetry(
        async () => {
          const result = await api.raw.chats.removeChatMember({
            chat_id,
            user_id,
            ...(block ? { block: true } : {}),
          });
          if (!result.success) {
            throw new MaxApiError(200, result.message || 'remove member failed');
          }
        },
        true,
        sleep,
      );
    },
    async setMyCommands(commands) {
      await withRetry(() => api.setMyCommands(commands), true, sleep);
    },
  };
}
