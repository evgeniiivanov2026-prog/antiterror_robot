import { Decision, ModerationAction } from '../domain/enums.js';
import type { IncomingMessage, ModerationDecision } from '../domain/messages.js';
import type { MaxGateway } from '../max/gateway.js';
import type { MessageRemover } from '../max/message-remover.js';
import type { AppLogger } from '../utils/logger.js';
import type { AuditService } from './audit.service.js';

/**
 * MAX Bot API documents DELETE /chats/{chatId}/members (kick) and DELETE /messages.
 * It does not document a mute/restrict method for a chat member. MUTE is recorded
 * and forwarded to admins; it is not sent through ctx.api.raw.
 */
const MUTE_NOTE =
  'Ограничение пользователя не отправлено: в MAX Bot API нет документированного метода mute. Нужна ручная проверка.';

export class SanctionService {
  constructor(
    private readonly deps: {
      gateway: MaxGateway;
      remover: MessageRemover;
      audit: AuditService;
      logger: AppLogger;
      adminRecipients: (chatId: string) => Promise<string[]>;
    },
  ) {}

  async apply(message: IncomingMessage, decision: ModerationDecision): Promise<void> {
    if (decision.decision === Decision.ALLOW || !decision.primary) return;

    if (decision.deleteMessage) {
      this.deps.remover.enqueue({
        chatId: message.chatId,
        messageId: message.messageId,
        reason: decision.primary.reason,
      });
    }

    if (decision.warnUser) {
      await this.safe(message, 'warn_failed', () =>
        this.deps.gateway.sendUserMessage(message.userId, warningText(decision)),
      );
    }

    const kick =
      decision.decision === Decision.KICK || decision.hardAction === ModerationAction.KICK;
    if (kick) {
      await this.safe(message, 'kick_failed', () =>
        this.deps.gateway.removeMember(message.chatId, message.userId),
      );
    }

    const mute =
      decision.decision === Decision.MUTE || decision.hardAction === ModerationAction.MUTE;
    if (mute) {
      await this.deps.audit.record({
        chatId: message.chatId,
        actorId: 'bot',
        targetUserId: message.userId,
        action: 'mute_unsupported',
        reason: MUTE_NOTE,
        metadata: { messageId: message.messageId, ruleId: decision.primary.ruleId },
      });
    }

    if (decision.notifyAdmins || mute) {
      await this.notifyAdmins(message, decision, mute);
    }
  }

  private async notifyAdmins(
    message: IncomingMessage,
    decision: ModerationDecision,
    mute: boolean,
  ): Promise<void> {
    let recipients: string[];
    try {
      recipients = await this.deps.adminRecipients(message.chatId);
    } catch (error) {
      this.deps.logger.error(
        { err: error instanceof Error ? error.message : 'admins', chatId: message.chatId },
        'admin notify lookup failed',
      );
      return;
    }
    const text = adminText(message, decision, mute);
    for (const userId of recipients) {
      await this.safe(message, 'notify_failed', () =>
        this.deps.gateway.sendUserMessage(userId, text),
      );
    }
  }

  private async safe(
    message: IncomingMessage,
    action: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'external call failed';
      this.deps.logger.error(
        { err: reason, chatId: message.chatId, action },
        'sanction call failed',
      );
      try {
        await this.deps.audit.record({
          chatId: message.chatId,
          actorId: 'bot',
          targetUserId: message.userId,
          action,
          reason: reason.slice(0, 200),
          metadata: { messageId: message.messageId },
        });
      } catch (auditError) {
        this.deps.logger.error(
          { err: auditError instanceof Error ? auditError.message : 'audit' },
          'audit write failed',
        );
      }
    }
  }
}

function warningText(decision: ModerationDecision): string {
  const reason = decision.primary?.reason ?? 'правило чата';
  return `Сообщение нарушает правила чата (${reason}). Повторы могут привести к ограничению.`;
}

function adminText(message: IncomingMessage, decision: ModerationDecision, mute: boolean): string {
  const primary = decision.primary;
  const lines = [
    `Модерация в чате ${message.chatId}`,
    `Пользователь: ${message.userId}`,
    `Сообщение: ${message.messageId}`,
    `Решение: ${decision.decision}`,
    `Причина: ${primary?.reason ?? '—'}`,
    `Тип: ${primary?.type ?? '—'}`,
    `Severity: ${primary?.severity ?? '—'}`,
  ];
  if (primary?.ruleId) lines.push(`Правило: ${primary.ruleId}`);
  if (mute) lines.push(MUTE_NOTE);
  return lines.join('\n');
}
