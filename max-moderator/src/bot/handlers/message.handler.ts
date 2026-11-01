import type { IncomingMessage } from '../../domain/types.js';
import { logger } from '../../utils/logger.js';
import { parseCommand } from '../../utils/command-parser.js';
import type { AdminHandler } from './admin.handler.js';
import type { ModerationPipeline } from '../../moderation/moderation-pipeline.service.js';
import type { MaxClient } from '../../max/max-client.js';

const KNOWN = new Set([
  'start',
  'help',
  'config',
  'filter',
  'links',
  'whitelist',
  'warnings',
  'audit',
  'purge',
  'admin',
]);

export interface BotServices {
  pipeline: ModerationPipeline;
  admin: AdminHandler;
  max: MaxClient;
}

export async function handleIncoming(
  message: IncomingMessage,
  services: BotServices,
): Promise<void> {
  const command = parseCommand(message.text);
  if (message.chatType === 'dialog') {
    if (command && (command.name === 'start' || command.name === 'help')) {
      await reply(message, await services.admin.handle(message), services.max);
    }
    return;
  }
  if (message.chatType !== 'chat') return;
  if (command && KNOWN.has(command.name)) {
    await reply(message, await services.admin.handle(message), services.max);
    return;
  }
  await services.pipeline.handle(message);
}

async function reply(message: IncomingMessage, lines: string[], max: MaxClient): Promise<void> {
  for (const line of lines) {
    try {
      await max.sendToChat(message.chatId, line);
    } catch (error) {
      logger.warn({ err: error, chatId: message.chatId }, 'command reply failed');
    }
  }
}
