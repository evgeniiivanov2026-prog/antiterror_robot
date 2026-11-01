import 'dotenv/config';
import { Bot } from '@maxhub/max-bot-api';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { createPrismaClient } from '../database/client.js';
import { createPrismaRepositories } from '../database/repositories/prisma-repositories.js';
import { createRedis, RedisKeyValue } from '../database/cache.js';
import { MaxBotGateway } from '../max/max-client.js';
import { createModerationApp } from './create-app.js';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrismaClient(env.databaseUrl);
const redis = createRedis(env.redisUrl, logger);
const bot = new Bot(env.token, {
  clientOptions: {
    baseUrl: 'https://platform-api2.max.ru',
  },
});
const gateway = new MaxBotGateway(bot.api, logger);
const app = createModerationApp({
  env,
  repositories: createPrismaRepositories(prisma, env),
  gateway,
  kv: new RedisKeyValue(redis),
  logger,
});

bot.catch((error) => {
  logger.error({ err: error }, 'unhandled bot error');
});

bot.on('message_created', async (ctx) => {
  await app.handleUpdate(ctx.update);
});

bot.on('message_edited', async (ctx) => {
  await app.handleUpdate(ctx.update);
});

async function registerCommands(): Promise<void> {
  try {
    await bot.api.setMyCommands([
      { name: 'help', description: 'Список команд модерации' },
      { name: 'config', description: 'Настройки чата' },
      { name: 'filter', description: 'Словесные фильтры' },
      { name: 'links', description: 'Фильтр ссылок' },
      { name: 'whitelist', description: 'Белый список' },
      { name: 'warnings', description: 'Нарушения пользователя' },
      { name: 'audit', description: 'Журнал модерации' },
    ]);
  } catch (error) {
    logger.warn({ err: error }, 'failed to register bot commands');
  }
}

async function shutdown(): Promise<void> {
  if (env.botMode === 'webhook') await bot.stopWebhook();
  else bot.stopPolling();
  await prisma.$disconnect();
  redis.disconnect();
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

try {
  await registerCommands();

  if (env.botMode === 'webhook') {
    logger.info({ port: env.webhookPort, path: env.webhookPath }, 'starting max webhook');
    await bot.start({
      mode: 'webhook',
      options: {
        domain: env.webhookDomain,
        port: env.webhookPort,
        path: env.webhookPath,
        ...(env.webhookSecret ? { secret: env.webhookSecret } : {}),
        allowedUpdates: ['message_created', 'message_edited'],
      },
    });
  } else {
    logger.info({}, 'starting max long polling');
    await bot.start({
      mode: 'polling',
      options: {
        allowedUpdates: ['message_created', 'message_edited'],
      },
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  console.error(`max-moderator: бот не запустился: ${message}${cause ? `; ${cause}` : ''}`);
  if (/issuer certificate|UNABLE_TO_GET_ISSUER_CERT/i.test(`${message} ${cause}`)) {
    console.error('max-moderator: не доверен сертификат max.ru. Нужен корневой сертификат Минцифры.');
  }
  if (/401|access_token|unauthorized/i.test(`${message} ${cause}`)) {
    console.error('max-moderator: MAX не принял токен. Впишите новый MAX_BOT_TOKEN в .env и пересоздайте контейнер.');
  }
  process.exit(1);
}
