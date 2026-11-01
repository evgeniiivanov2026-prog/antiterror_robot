import { Bot, type Context } from '@maxhub/max-bot-api';
import { logger } from '../utils/logger.js';
import { parseIncoming } from './parse-update.js';
import { handleIncoming, type BotServices } from './handlers/message.handler.js';

export const BOT_COMMANDS = [
  { name: 'help', description: 'Справка по командам модерации' },
  { name: 'config', description: 'Показать настройки чата' },
  { name: 'filter', description: 'Управление фильтрами слов' },
  { name: 'links', description: 'Политика ссылок' },
  { name: 'audit', description: 'Последние действия модерации' },
];

export function registerHandlers(bot: Bot, services: BotServices): void {
  const onMessage = async (ctx: Context) => {
    const message = parseIncoming(ctx);
    if (!message) {
      logger.warn({ updateType: ctx.updateType }, 'skipped invalid message payload');
      return;
    }
    try {
      await handleIncoming(message, services);
    } catch (error) {
      logger.error(
        { err: error, chatId: message.chatId, messageId: message.messageId },
        'message handling failed',
      );
    }
  };
  bot.on('message_created', onMessage);
  bot.on('message_edited', onMessage);
  bot.catch((error) => {
    logger.error({ err: error }, 'unhandled bot error');
  });
}

export function createBot(token: string, baseUrl: string): Bot {
  return new Bot(token, {
    clientOptions: { baseUrl },
  });
}
