import 'dotenv/config';
import { Bot } from '@maxhub/max-bot-api';
import { loadEnv, type AppEnv } from '../config/env.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { createPrismaClient } from '../database/client.js';
import { createPrismaRepositories } from '../database/repositories/prisma-repositories.js';
import { createRedis, RedisKeyValue } from '../database/cache.js';
import { MaxBotGateway } from '../max/max-client.js';
import { createModerationApp } from './create-app.js';

const apiBaseUrl = 'https://platform-api2.max.ru';

function failureText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const text = `${message} ${cause}`;
  if (/issuer certificate|UNABLE_TO_GET_ISSUER_CERT/i.test(text)) {
    return `max-moderator: нет доверия к сертификату max.ru. ${message}`;
  }
  if (/401|access_token|unauthorized/i.test(text)) {
    return 'max-moderator: MAX не принял токен. Проверьте MAX_BOT_TOKEN в файле .env и выполните docker compose up -d --force-recreate bot';
  }
  return `max-moderator: нет связи с MAX, повтор через 15 секунд: ${message}${cause ? `; ${cause}` : ''}`;
}

async function serve(env: AppEnv, logger: Logger): Promise<void> {
  const prisma = createPrismaClient(env.databaseUrl);
  const redis = createRedis(env.redisUrl, logger);
  const bot = new Bot(env.token, { clientOptions: { baseUrl: apiBaseUrl } });
  const gateway = new MaxBotGateway(bot.api, logger);
  const app = createModerationApp({
    env,
    repositories: createPrismaRepositories(prisma, env),
    gateway,
    kv: new RedisKeyValue(redis),
    logger,
  });

  const shutdown = async (): Promise<void> => {
    if (env.botMode === 'webhook') await bot.stopWebhook();
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

  bot.catch((error) => {
    logger.error({ err: error }, 'unhandled bot error');
  });
  bot.on('message_created', async (ctx) => {
    await app.handleUpdate(ctx.update);
  });
  bot.on('message_edited', async (ctx) => {
    await app.handleUpdate(ctx.update);
  });

  for (;;) {
    try {
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
      console.error('max-moderator: подключаюсь к platform-api2.max.ru');
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
      return;
    } catch (error) {
      console.error(failureText(error));
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  }
}

try {
  const env = loadEnv();
  const logger = createLogger(env);
  await serve(env, logger);
} catch (error) {
  console.error(
    `max-moderator: программа остановлена: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
