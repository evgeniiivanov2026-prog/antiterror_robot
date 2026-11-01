import { MemoryCacheStore } from '../src/cache/cache-store.js';
import type { AppConfig } from '../src/config/env.js';
import { createMemoryRepositories } from '../src/database/repositories/memory.js';
import { LinkMode, ModerationAction } from '../src/domain/enums.js';
import type { IncomingMessage, PlatformAdmin, RecentMessage } from '../src/domain/types.js';
import { MaxApiError, type MaxClient } from '../src/max/max-client.js';
import { MessageRemover } from '../src/max/message-remover.js';
import { ChatDeletionRateLimiter } from '../src/max/rate-limiter.js';
import { AiModerator } from '../src/moderation/ai-moderator.js';
import { AuditService } from '../src/moderation/audit.service.js';
import { LinkFilterService } from '../src/moderation/link-filter.service.js';
import { ModerationPipeline } from '../src/moderation/moderation-pipeline.service.js';
import { PermissionService } from '../src/moderation/permissions.service.js';
import { RulesCache } from '../src/moderation/rules-cache.js';
import { SanctionService } from '../src/moderation/sanction.service.js';
import { SpamFilterService } from '../src/moderation/spam-filter.service.js';
import { WordFilterService } from '../src/moderation/word-filter.service.js';
import { AdminHandler } from '../src/bot/handlers/admin.handler.js';
import type { Clock } from '../src/utils/clock.js';

export class ManualClock implements Clock {
  constructor(public value = 1_700_000_000_000) {}

  now(): number {
    return this.value;
  }
}

export class FakeMax implements MaxClient {
  deleted: string[] = [];
  chats: string[] = [];
  users: string[] = [];
  admins: PlatformAdmin[] = [];
  recent: RecentMessage[] = [];
  deleteError: Error | null = null;
  adminError: Error | null = null;
  kicked: string[] = [];

  async deleteMessage(messageId: string): Promise<void> {
    if (this.deleteError) throw this.deleteError;
    this.deleted.push(messageId);
  }

  async sendToChat(_chatId: string, text: string): Promise<void> {
    this.chats.push(text);
  }

  async sendToUser(userId: string, text: string): Promise<void> {
    this.users.push(`${userId}:${text}`);
  }

  async getAdmins(): Promise<PlatformAdmin[]> {
    if (this.adminError) throw this.adminError;
    return this.admins;
  }

  async getRecentMessages(): Promise<RecentMessage[]> {
    return this.recent;
  }

  async removeMember(_chatId: string, userId: string): Promise<void> {
    this.kicked.push(userId);
  }

  async setMyCommands(): Promise<void> {}
}

export function message(patch: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    messageId: 'm1',
    chatId: '100',
    chatType: 'chat',
    userId: '42',
    isBot: false,
    text: 'hello',
    links: [],
    mentionCount: 0,
    mediaTypes: [],
    isForward: false,
    timestamp: 1,
    ...patch,
  };
}

export function testConfig(adminIds: string[] = []): AppConfig {
  return {
    nodeEnv: 'test',
    logLevel: 'info',
    adminIds: new Set(adminIds),
    defaultLinkMode: LinkMode.REVIEW,
    defaultWordAction: ModerationAction.DELETE,
    maxDeletionsPerSecond: 2,
    apiBaseUrl: 'https://platform-api2.max.ru',
    botMode: 'polling',
    webhookPort: 8080,
  };
}

export function buildHarness(adminIds: string[] = []) {
  const clock = new ManualClock();
  const store = new MemoryCacheStore();
  const repos = createMemoryRepositories();
  const max = new FakeMax();
  const config = testConfig(adminIds);
  const cache = new RulesCache(store);
  const permissions = new PermissionService(repos, store, max, config);
  const limiter = new ChatDeletionRateLimiter(store, config.maxDeletionsPerSecond, clock);
  const sleep = async (ms: number) => {
    clock.value += ms;
  };
  const remover = new MessageRemover(max, limiter, sleep);
  const audit = new AuditService(repos.audit);
  const sanctions = new SanctionService(repos, audit, remover, max, clock);
  const pipeline = new ModerationPipeline(
    repos,
    permissions,
    new WordFilterService(repos.filters, cache),
    new LinkFilterService(repos.links, cache),
    new SpamFilterService(store, repos.violations, clock),
    sanctions,
    new AiModerator(undefined, fetch),
    clock,
    config,
    store,
  );
  const admin = new AdminHandler(repos, cache, permissions, audit, remover, max, config, clock);
  return { clock, store, repos, max, pipeline, admin, audit, limiter, cache };
}

export { MaxApiError };
