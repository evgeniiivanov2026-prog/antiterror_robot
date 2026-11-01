import type { IncomingMessage } from '../../domain/messages.js';
import type { MaxGateway } from '../../max/gateway.js';
import type { ModerationPipeline } from '../../moderation/moderation-pipeline.service.js';
import type { AppLogger } from '../../utils/logger.js';
import type { AdminCommandService } from './admin.handler.js';
import { parseBotAdded, parseMessageCreated } from '../update.js';

export class MessageHandler {
  constructor(
    private readonly deps: {
      pipeline: ModerationPipeline;
      commands: AdminCommandService;
      gateway: MaxGateway;
      logger: AppLogger;
    },
  ) {}

  async onUpdate(update: unknown): Promise<void> {
    const added = parseBotAdded(update);
    if (added) {
      await this.deps.pipeline.ensureSettings(added.chatId);
      await this.safeSend(added.chatId, 'Модерация включена. Список команд: /help');
      return;
    }
    const message = parseMessageCreated(update);
    if (!message) {
      this.deps.logger.warn({ updateType: readUpdateType(update) }, 'ignored update');
      return;
    }
    await this.onMessage(message);
  }

  async onMessage(message: IncomingMessage): Promise<void> {
    try {
      const reply = await this.deps.commands.execute(message);
      if (reply !== null) {
        await this.safeSend(message.chatId, reply);
        return;
      }
      await this.deps.pipeline.handle(message);
    } catch (error) {
      this.deps.logger.error(
        { err: error instanceof Error ? error.message : 'handler', chatId: message.chatId },
        'message handling failed',
      );
    }
  }

  private async safeSend(chatId: string, text: string): Promise<void> {
    try {
      await this.deps.gateway.sendChatMessage(chatId, text);
    } catch (error) {
      this.deps.logger.error(
        { err: error instanceof Error ? error.message : 'send', chatId },
        'reply failed',
      );
    }
  }
}

function readUpdateType(update: unknown): string {
  if (update && typeof update === 'object' && 'update_type' in update) {
    const value = (update as { update_type?: unknown }).update_type;
    return typeof value === 'string' ? value : 'unknown';
  }
  return 'unknown';
}
