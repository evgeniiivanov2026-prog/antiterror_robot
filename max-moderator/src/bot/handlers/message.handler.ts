import type { ProcessedEventRepository } from '../../database/repositories/types.js';
import type { MaxGateway } from '../../max/gateway.js';
import { ModerationPipeline } from '../../moderation/moderation-pipeline.service.js';
import type { Logger } from '../../utils/logger.js';
import { parseIncoming } from '../incoming.js';
import { PrivilegeService } from '../privileges.js';
import { MODERATION_COMMANDS, AdminHandler } from './admin.handler.js';

export class MessageHandler {
  constructor(
    private readonly pipeline: ModerationPipeline,
    private readonly admin: AdminHandler,
    private readonly privileges: PrivilegeService,
    private readonly events: ProcessedEventRepository,
    private readonly gateway: MaxGateway,
    private readonly logger: Logger,
  ) {}

  async handle(update: unknown): Promise<void> {
    const message = parseIncoming(update);
    if (!message) {
      this.logger.warn({}, 'ignored invalid update');
      return;
    }
    if (message.isBot) return;
    const claimed = await this.events.claim(message.chatId, message.messageId, message.eventKey);
    if (!claimed) return;
    try {
      if (message.chatType === 'dialog') {
        await this.admin.handleDialog(message);
        return;
      }
      const commandName = message.command?.name;
      if (commandName === 'start' || commandName === 'help') {
        await this.admin.handle(message);
        return;
      }
      if (commandName && MODERATION_COMMANDS.has(commandName)) {
        if (await this.privileges.canCommand(message)) {
          await this.admin.handle(message);
          return;
        }
        await this.gateway.sendChatMessage(
          message.chatId,
          'Команда доступна только администраторам чата.',
        );
      } else if (
        (await this.privileges.canCommand(message)) &&
        (await this.admin.consumePending(message))
      ) {
        return;
      }
      if (await this.privileges.isExempt(message)) return;
      await this.pipeline.handle(message);
    } catch (error) {
      this.logger.error(
        { err: error, chatId: message.chatId, messageId: message.messageId },
        'update handling failed',
      );
    }
  }
}
