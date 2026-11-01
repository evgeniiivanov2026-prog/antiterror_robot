import { createRedis, RedisCacheStore } from './cache/redis-store.js';
import { BOT_COMMANDS, createBot, registerHandlers } from './bot/index.js';
import { AdminHandler } from './bot/handlers/admin.handler.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './database/client.js';
import { createPrismaRepositories } from './database/repositories/prisma.js';
import { createLibraryMaxClient } from './max/max-client.js';
import { MessageRemover } from './max/message-remover.js';
import { ChatDeletionRateLimiter } from './max/rate-limiter.js';
import { AiModerator } from './moderation/ai-moderator.js';
import { AuditService } from './moderation/audit.service.js';
import { LinkFilterService } from './moderation/link-filter.service.js';
import { ModerationPipeline } from './moderation/moderation-pipeline.service.js';
import { PermissionService } from './moderation/permissions.service.js';
import { RulesCache } from './moderation/rules-cache.js';
import { SanctionService } from './moderation/sanction.service.js';
import { SpamFilterService } from './moderation/spam-filter.service.js';
import { WordFilterService } from './moderation/word-filter.service.js';
import { systemClock, systemSleep } from './utils/clock.js';
import { createLogger } from './utils/logger.js';

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const log = createLogger(env.config.logLevel);
  const prisma = createPrismaClient(env.databaseUrl);
  const redis = createRedis(env.redisUrl);
  const store = new RedisCacheStore(redis);
  const repos = createPrismaRepositories(prisma);
  const bot = createBot(env.token, env.config.apiBaseUrl);
  const max = createLibraryMaxClient(bot.api);
  const cache = new RulesCache(store);
  const permissions = new PermissionService(repos, store, max, env.config);
  const audit = new AuditService(repos.audit);
  const remover = new MessageRemover(
    max,
    new ChatDeletionRateLimiter(store, env.config.maxDeletionsPerSecond, systemClock),
    systemSleep,
  );
  const sanctions = new SanctionService(repos, audit, remover, max, systemClock);
  const pipeline = new ModerationPipeline(
    repos,
    permissions,
    new WordFilterService(repos.filters, cache),
    new LinkFilterService(repos.links, cache),
    new SpamFilterService(store, repos.violations, systemClock),
    sanctions,
    new AiModerator(env.config.aiModerationUrl, fetch),
    systemClock,
    env.config,
    store,
  );
  const admin = new AdminHandler(
    repos,
    cache,
    permissions,
    audit,
    remover,
    max,
    env.config,
    systemClock,
  );
  registerHandlers(bot, { pipeline, admin, max });

  const shutdown = async () => {
    if (env.config.botMode === 'webhook') await bot.stopWebhook();
    else bot.stopPolling();
    await prisma.$disconnect();
    redis.disconnect();
  };
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  try {
    await max.setMyCommands(BOT_COMMANDS);
  } catch (error) {
    log.warn({ err: error }, 'setMyCommands failed');
  }

  log.info(
    { mode: env.config.botMode, apiBaseUrl: env.config.apiBaseUrl },
    'starting MAX moderation bot',
  );
  if (env.config.botMode === 'webhook') {
    if (!env.config.webhookDomain) throw new Error('WEBHOOK_DOMAIN is required');
    await bot.start({
      mode: 'webhook',
      options: {
        domain: env.config.webhookDomain,
        port: env.config.webhookPort,
        ...(env.config.webhookPath ? { path: env.config.webhookPath } : {}),
        ...(env.config.webhookSecret ? { secret: env.config.webhookSecret } : {}),
        allowedUpdates: ['message_created', 'message_edited'],
      },
    });
    return;
  }
  await bot.start({
    mode: 'polling',
    options: { allowedUpdates: ['message_created', 'message_edited'] },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'startup failed';
  console.error(message);
  process.exitCode = 1;
});
