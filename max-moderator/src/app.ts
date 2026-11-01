import type { Redis } from 'ioredis';
import { MemoryCache, type KeyValueCache } from './cache/cache.js';
import { RedisCache } from './cache/redis-cache.js';
import type { AppConfig } from './config/env.js';
import { createPrismaClient } from './database/client.js';
import { createMemoryRepositories } from './database/repositories/memory.js';
import { createPrismaRepositories } from './database/repositories/prisma.js';
import type { Repositories } from './database/repositories/types.js';
import { AdminCommandService } from './bot/handlers/admin.handler.js';
import { MessageHandler } from './bot/handlers/message.handler.js';
import { AuditService } from './moderation/audit.service.js';
import { LinkFilterService } from './moderation/link-filter.service.js';
import {
  DisabledAiModerator,
  ModerationPipeline,
} from './moderation/moderation-pipeline.service.js';
import { PermissionService } from './moderation/permissions.js';
import { RedisSpamTracker } from './moderation/redis-spam-tracker.js';
import { SanctionService } from './moderation/sanction.service.js';
import { MemorySpamTracker, SpamFilterService } from './moderation/spam-filter.service.js';
import { WordFilterService } from './moderation/word-filter.service.js';
import type { MaxGateway } from './max/gateway.js';
import { LibraryMaxGateway, createMaxBot } from './max/max-client.js';
import {
  QueuedMessageRemover,
  RedisMessageRemover,
  type MessageRemover,
} from './max/message-remover.js';
import { RedisRateLimiter } from './max/redis-rate-limiter.js';
import { SlidingWindowRateLimiter, systemClock, type RateLimiter } from './max/rate-limiter.js';
import type { AppLogger } from './utils/logger.js';
import { createLogger } from './utils/logger.js';
import type { Bot } from '@maxhub/max-bot-api';

export interface RunningApp {
  bot: Bot;
  handler: MessageHandler;
  redis: Redis;
  stop: () => Promise<void>;
}

export function createRuntimeServices(input: {
  config: AppConfig;
  repos: Repositories;
  cache: KeyValueCache;
  gateway: MaxGateway;
  limiter: RateLimiter;
  spam: SpamFilterService;
  logger: AppLogger;
  remover?: MessageRemover;
  extraFilters?: import('./moderation/moderation-pipeline.service.js').ModerationFilter[];
}): {
  pipeline: ModerationPipeline;
  commands: AdminCommandService;
  handler: MessageHandler;
  remover: MessageRemover;
} {
  const audit = new AuditService(input.repos.audit, input.logger);
  const words = new WordFilterService(input.repos.filters, input.cache);
  const links = new LinkFilterService(input.repos.links, input.cache);
  const permissions = new PermissionService({
    adminIds: input.config.adminIds,
    roles: input.repos.roles,
    gateway: input.gateway,
    cache: input.cache,
    logger: input.logger,
  });
  const remover =
    input.remover ??
    new QueuedMessageRemover(
      input.limiter,
      (job) => input.gateway.deleteMessage(job.messageId),
      async (job, error) => {
        await audit.record({
          chatId: job.chatId,
          actorId: 'bot',
          targetUserId: null,
          action: error ? 'delete_failed' : 'message_deleted',
          reason: error instanceof Error ? error.message : job.reason,
          metadata: { messageId: job.messageId },
        });
      },
    );
  const sanctions = new SanctionService({
    gateway: input.gateway,
    remover,
    audit,
    logger: input.logger,
    adminRecipients: (chatId) => permissions.adminRecipients(chatId),
  });
  const pipeline = new ModerationPipeline({
    repos: input.repos,
    words,
    links,
    spam: input.spam,
    sanctions,
    audit,
    permissions,
    logger: input.logger,
    defaults: input.config,
    ai: new DisabledAiModerator(),
    ...(input.extraFilters ? { extraFilters: input.extraFilters } : {}),
  });
  const commands = new AdminCommandService({
    repos: input.repos,
    words,
    links,
    permissions,
    audit,
    pipeline,
    gateway: input.gateway,
    remover,
    cache: input.cache,
  });
  const handler = new MessageHandler({
    pipeline,
    commands,
    gateway: input.gateway,
    logger: input.logger,
  });
  return { pipeline, commands, handler, remover };
}

export async function startBot(config: AppConfig): Promise<RunningApp> {
  const logger = createLogger(config.logLevel, config.nodeEnv === 'development');
  const { createRedis } = await import('./cache/redis-cache.js');
  const redis = createRedis(config.redisUrl);
  const prisma = createPrismaClient(config.databaseUrl);
  const repos = createPrismaRepositories(prisma);
  const cache = new RedisCache(redis);
  const bot = createMaxBot(config.token, config.apiBaseUrl);
  const gateway = new LibraryMaxGateway(bot.api);
  const limiter = new RedisRateLimiter(redis, config.maxDeletionsPerSecond, 1_000);
  const spam = new SpamFilterService(new RedisSpamTracker(redis));
  const audit = new AuditService(repos.audit, logger);
  const remover = new RedisMessageRemover(
    redis,
    limiter,
    (job) => gateway.deleteMessage(job.messageId),
    async (job, error) => {
      await audit.record({
        chatId: job.chatId,
        actorId: 'bot',
        targetUserId: null,
        action: error ? 'delete_failed' : 'message_deleted',
        reason: error instanceof Error ? error.message : job.reason,
        metadata: { messageId: job.messageId },
      });
    },
    logger,
  );
  const { handler } = createRuntimeServices({
    config,
    repos,
    cache,
    gateway,
    limiter,
    spam,
    logger,
    remover,
  });
  remover.start();

  bot.catch((error) => {
    logger.error({ err: error instanceof Error ? error.message : 'bot' }, 'update failed');
  });
  bot.on('message_created', (ctx) => handler.onUpdate(ctx.update));
  bot.on('bot_added', (ctx) => handler.onUpdate(ctx.update));

  const info = await bot.api.getMyInfo();
  logger.info(
    { botId: info.user_id, username: info.username, mode: config.botMode },
    'bot started',
  );

  let starting: Promise<void>;
  if (config.botMode === 'webhook') {
    if (!config.webhookSecret || !config.webhookDomain) {
      throw new Error('WEBHOOK_SECRET и WEBHOOK_DOMAIN обязательны в режиме webhook');
    }
    starting = bot.start({
      mode: 'webhook',
      options: {
        domain: config.webhookDomain,
        port: config.webhookPort,
        path: config.webhookPath,
        secret: config.webhookSecret,
        allowedUpdates: ['message_created', 'bot_added'],
      },
    });
  } else {
    starting = bot.start({
      mode: 'polling',
      options: { allowedUpdates: ['message_created', 'bot_added'] },
    });
  }
  starting.catch((error: unknown) => {
    logger.error({ err: error instanceof Error ? error.message : 'start' }, 'bot loop stopped');
    process.exitCode = 1;
  });

  return {
    bot,
    handler,
    redis,
    stop: async () => {
      remover.stop();
      if (config.botMode === 'webhook') await bot.stopWebhook();
      else bot.stopPolling();
      await redis.quit();
      await prisma.$disconnect();
    },
  };
}

export function createTestHarness(
  config: AppConfig,
  gateway: MaxGateway,
  logger: AppLogger,
  extraFilters?: import('./moderation/moderation-pipeline.service.js').ModerationFilter[],
) {
  const repos = createMemoryRepositories();
  const cache = new MemoryCache();
  const limiter = new SlidingWindowRateLimiter(config.maxDeletionsPerSecond, 1_000, systemClock);
  const services = createRuntimeServices({
    config,
    repos,
    cache,
    gateway,
    limiter,
    spam: new SpamFilterService(new MemorySpamTracker()),
    logger,
    ...(extraFilters ? { extraFilters } : {}),
  });
  return { ...services, repos, cache, limiter };
}
