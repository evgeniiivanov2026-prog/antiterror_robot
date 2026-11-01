import type { Repositories } from '../database/repositories/types.js';
import { ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type { ChatSettingsRecord, Effects, FilterHit, IncomingMessage } from '../domain/types.js';
import type { MaxClient } from '../max/max-client.js';
import type { MessageRemover } from '../max/message-remover.js';
import type { Clock } from '../utils/clock.js';
import { logger } from '../utils/logger.js';
import type { AuditService } from './audit.service.js';
import { resolveEffects } from './effects.js';

export class SanctionService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    private readonly remover: MessageRemover,
    private readonly max: MaxClient,
    private readonly clock: Clock,
  ) {}

  async apply(
    message: IncomingMessage,
    hit: FilterHit,
    settings: ChatSettingsRecord,
    contentHash: string,
  ): Promise<void> {
    const effects = hit.effects ?? resolveEffects(hit.action, hit.severity, settings.hardAction);
    const inserted = await this.repos.violations.insert({
      chatId: message.chatId,
      userId: message.userId,
      messageId: message.messageId,
      contentHash,
      ruleId: hit.ruleId,
      violationType: hit.type,
      severity: hit.severity,
      action: hit.action,
      reason: hit.reason,
    });
    if (inserted === 'duplicate') return;

    await this.audit.record({
      chatId: message.chatId,
      actorId: 'bot',
      targetUserId: message.userId,
      action: primaryAction(effects, hit),
      reason: hit.reason,
      metadata: {
        messageId: message.messageId,
        ruleId: hit.ruleId,
        ruleType: hit.type,
        severity: hit.severity,
      },
    });

    if (effects.delete) {
      const result = await this.remover.remove(message.chatId, message.messageId);
      if (!result.ok) {
        await this.audit.record({
          chatId: message.chatId,
          actorId: 'bot',
          targetUserId: message.userId,
          action: 'delete_failed',
          reason: hit.reason,
          metadata: { messageId: message.messageId, status: result.status },
        });
      }
    }
    if (effects.warn) await this.warn(message, hit);
    if (effects.mute) await this.mute(message, settings, hit);
    if (effects.kick) await this.kick(message, hit);
    if (effects.notify) await this.notify(message, hit);
  }

  private async warn(message: IncomingMessage, hit: FilterHit): Promise<void> {
    try {
      await this.max.sendToUser(
        message.userId,
        `Сообщение в чате ${message.chatId} нарушает правило (${hit.reason}). Повтор приведёт к ограничению.`,
      );
    } catch (error) {
      logger.warn(
        { err: error, chatId: message.chatId, userId: message.userId },
        'warn delivery failed',
      );
      await this.audit.record({
        chatId: message.chatId,
        actorId: 'bot',
        targetUserId: message.userId,
        action: 'warn_failed',
        reason: hit.reason,
        metadata: { messageId: message.messageId },
      });
    }
  }

  private async mute(
    message: IncomingMessage,
    settings: ChatSettingsRecord,
    hit: FilterHit,
  ): Promise<void> {
    const until = this.clock.now() + settings.muteMinutes * 60 * 1000;
    await this.repos.restrictions.mute(message.chatId, message.userId, until, hit.reason);
    await this.audit.record({
      chatId: message.chatId,
      actorId: 'bot',
      targetUserId: message.userId,
      action: 'mute',
      reason: hit.reason,
      metadata: { until, note: 'local_mute_platform_mute_not_documented' },
    });
  }

  private async kick(message: IncomingMessage, hit: FilterHit): Promise<void> {
    try {
      await this.max.removeMember(message.chatId, message.userId, false);
      await this.audit.record({
        chatId: message.chatId,
        actorId: 'bot',
        targetUserId: message.userId,
        action: 'kick',
        reason: hit.reason,
        metadata: { messageId: message.messageId },
      });
    } catch (error) {
      logger.warn({ err: error, chatId: message.chatId, userId: message.userId }, 'kick failed');
      await this.audit.record({
        chatId: message.chatId,
        actorId: 'bot',
        targetUserId: message.userId,
        action: 'kick_failed',
        reason: hit.reason,
        metadata: { messageId: message.messageId },
      });
    }
  }

  private async notify(message: IncomingMessage, hit: FilterHit): Promise<void> {
    const text = `Модерация чата ${message.chatId}: пользователь ${message.userId}, ${hit.reason}, ${hit.severity}.`;
    let admins: Array<{ userId: string; isBot: boolean }> = [];
    try {
      admins = await this.max.getAdmins(message.chatId);
    } catch (error) {
      logger.warn({ err: error, chatId: message.chatId }, 'admin notify lookup failed');
    }
    const targets = new Set<string>(
      admins.filter((admin) => !admin.isBot).map((admin) => admin.userId),
    );
    if (targets.size === 0) {
      await this.audit.record({
        chatId: message.chatId,
        actorId: 'bot',
        targetUserId: message.userId,
        action: 'notify_failed',
        reason: hit.reason,
        metadata: { messageId: message.messageId },
      });
      return;
    }
    for (const userId of targets) {
      try {
        await this.max.sendToUser(userId, text);
      } catch (error) {
        logger.warn({ err: error, chatId: message.chatId, userId }, 'admin notify failed');
      }
    }
  }
}

function primaryAction(effects: Effects, hit: FilterHit): string {
  if (effects.review) return 'review';
  if (effects.delete) return 'delete';
  if (effects.kick) return 'kick';
  if (effects.mute) return 'mute';
  if (effects.warn) return 'warn';
  if (effects.notify) return 'notify_admins';
  return hit.action.toLowerCase();
}

export function muteHit(reason: string): FilterHit {
  return {
    type: RuleType.FLOOD,
    action: ModerationAction.DELETE,
    severity: Severity.MEDIUM,
    ruleId: null,
    reason,
    priority: 0,
    effects: { delete: true, warn: false, mute: false, kick: false, notify: false, review: false },
  };
}
