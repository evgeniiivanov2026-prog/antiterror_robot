import { createModerationApp, type ModerationApp } from '../src/bot/create-app.js';
import { MemoryKeyValue } from '../src/database/cache.js';
import { createMemoryRepositories } from '../src/database/memory/memory-database.js';
import type { Repositories } from '../src/database/repositories/types.js';
import type {
  BotMembership,
  MaxGateway,
  MemberSnapshot,
  RecentMessage,
} from '../src/max/gateway.js';
import { ModerationAction } from '../src/moderation/types.js';
import { silentLogger } from '../src/utils/logger.js';

export class FakeMax implements MaxGateway {
  deleted: string[] = [];
  chats: string[] = [];
  users: string[] = [];
  members = new Map<string, MemberSnapshot>();
  recent: RecentMessage[] = [];
  membership: BotMembership = {
    isAdmin: true,
    permissions: ['read_all_messages', 'write', 'add_remove_members'],
  };
  failDelete: Error | null = null;
  removedMembers: string[] = [];

  async deleteMessage(messageId: string): Promise<void> {
    if (this.failDelete) throw this.failDelete;
    this.deleted.push(messageId);
  }

  async sendChatMessage(_chatId: string, text: string): Promise<void> {
    this.chats.push(text);
  }

  async sendUserMessage(_userId: string, text: string): Promise<void> {
    this.users.push(text);
  }

  async getMember(chatId: string, userId: string): Promise<MemberSnapshot | null> {
    return this.members.get(`${chatId}:${userId}`) ?? null;
  }

  async getBotMembership(): Promise<BotMembership | null> {
    return this.membership;
  }

  async getAdmins(): Promise<MemberSnapshot[]> {
    return [...this.members.values()].filter((member) => member.isAdmin || member.isOwner);
  }

  async removeMember(_chatId: string, userId: string): Promise<void> {
    this.removedMembers.push(userId);
  }

  async listRecentMessages(): Promise<RecentMessage[]> {
    return this.recent;
  }
}

export function createTestApp(): {
  app: ModerationApp;
  max: FakeMax;
  repositories: Repositories;
} {
  const max = new FakeMax();
  const repositories = createMemoryRepositories({
    defaultLinkMode: 'review',
    defaultWordAction: ModerationAction.DELETE,
  });
  const app = createModerationApp({
    env: {
      adminIds: ['1'],
      deletionsPerSecond: 2,
      aiModerationUrl: '',
      aiModerationToken: '',
    },
    repositories,
    gateway: max,
    kv: new MemoryKeyValue(),
    logger: silentLogger,
  });
  return { app, max, repositories };
}

export function groupMessage(options: {
  text: string;
  userId?: string;
  messageId: string;
  timestamp?: number;
  chatId?: number;
  isBot?: boolean;
}): unknown {
  return {
    update_type: 'message_created',
    timestamp: options.timestamp ?? 1,
    message: {
      sender: { user_id: Number(options.userId ?? '2'), is_bot: options.isBot ?? false },
      recipient: { chat_id: options.chatId ?? 100, chat_type: 'chat' },
      body: { mid: options.messageId, text: options.text },
    },
  };
}
