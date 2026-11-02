import type { JsonCache, KeyValue } from '../database/cache.js';
import type { Repositories } from '../database/repositories/types.js';
import type { MaxGateway } from '../max/gateway.js';
import type { MessageRemover } from '../max/message-remover.js';
import type { Logger } from '../utils/logger.js';
import type { AiModerator } from './ai-moderator.js';
import { AuditService } from './audit.service.js';
import { planFromHits } from './decision.js';
import { LinkFilterService } from './link-filter.service.js';
import { SanctionService } from './sanction.service.js';
import { Severity } from './severity.js';
import { SpamFilterService } from './spam-filter.service.js';
import {
  FilterType,
  ModerationAction,
  type ChatSettings,
  type FilterHit,
  type WordFilter,
} from './types.js';
import { WordFilterService } from './word-filter.service.js';
import type { IncomingMessage } from '../bot/incoming.js';

export interface PipelineDeps {
  repositories: Repositories;
  cache: JsonCache;
  kv: KeyValue;
  gateway: MaxGateway;
  remover: MessageRemover;
  logger: Logger;
  ai: AiModerator;
  adminIds: string[];
  now: () => number;
}

export class ModerationPipeline {
  private readonly words = new WordFilterService();
  private readonly links = new LinkFilterService();
  private readonly spam: SpamFilterService;
  private readonly sanctions: SanctionService;
  private readonly audit: AuditService;

  constructor(private readonly deps: PipelineDeps) {
    this.spam = new SpamFilterService(deps.kv, deps.now);
    this.sanctions = new SanctionService(deps.kv, deps.gateway, deps.logger, deps.now);
    this.audit = new AuditService(deps.repositories.audit);
  }

  async handle(message: IncomingMessage): Promise<void> {
    if (await this.deps.repositories.violations.exists(message.chatId, message.messageId)) return;
    const settings = await this.loadSettings(message.chatId);
    if (!settings.enabled) return;

    const rules = await this.loadFilters(message.chatId);
    const hits: FilterHit[] = [];

    if (await this.sanctions.isMuted(message.chatId, message.userId)) {
      hits.push({
        type: 'MUTE_ACTIVE',
        action: ModerationAction.DELETE,
        severity: Severity.MEDIUM,
        reason: 'user is muted',
      });
    }

    await this.collect(hits, 'links', async () => {
      const linkRules = await this.loadLinks(message.chatId);
      const hit = this.links.inspect(
        [message.scannedText],
        [...message.buttonUrls, ...message.shareUrls],
        linkRules,
        settings,
      );
      if (hit) hits.push(hit);
    });

    await this.collect(hits, 'words', async () => {
      hits.push(...this.words.match(message.scannedText, rules));
    });

    await this.collect(hits, 'structural', async () => {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.type === FilterType.MEDIA && message.hasMedia)
          hits.push(this.hitFromRule(rule, 'media attachment'));
        if (rule.type === FilterType.FORWARD && message.isForward)
          hits.push(this.hitFromRule(rule, 'forwarded message'));
      }
    });

    await this.collect(hits, 'spam', async () => {
      const spamHit = await this.spam.inspect({
        chatId: message.chatId,
        userId: message.userId,
        text: message.text,
        mentionCount: message.mentionCount,
        settings,
      });
      if (!spamHit) return;
      const override = rules.find((rule) => rule.enabled && rule.type === spamHit.type);
      if (override) {
        spamHit.action = override.action;
        spamHit.severity = override.severity;
        spamHit.ruleId = override.id;
      }
      hits.push(spamHit);
    });

    if (hits.length === 0) {
      await this.collect(hits, 'ai', async () => {
        const rule = rules.find((item) => item.enabled && item.type === FilterType.CUSTOM_AI);
        if (!rule) return;
        const aiHit = await this.deps.ai.review(message.text);
        if (!aiHit) return;
        aiHit.ruleId = rule.id;
        aiHit.severity = rule.severity;
        aiHit.action =
          rule.action === ModerationAction.NOTIFY_ADMINS
            ? ModerationAction.NOTIFY_ADMINS
            : ModerationAction.REVIEW;
        hits.push(aiHit);
      });
    }

    const plan = planFromHits(hits, settings);
    if (!plan) return;

    const inserted = await this.deps.repositories.violations.insertIfAbsent({
      chatId: message.chatId,
      userId: message.userId,
      messageId: message.messageId,
      ruleId: plan.ruleId ?? null,
      violationType: plan.violationType,
      severity: plan.severity,
      action: plan.decision as ModerationAction,
      reason: plan.reason,
    });
    if (!inserted.created) return;

    let deleteOk: boolean | null = null;
    if (plan.deleteMessage) {
      const removed = await this.deps.remover.remove(message.chatId, message.messageId);
      deleteOk = removed.ok;
    }
    if (plan.mute) await this.sanctions.mute(message.chatId, message.userId, settings.muteSeconds);
    let kickOk: boolean | null = null;
    if (plan.kick) {
      const kicked = await this.sanctions.kick(message.chatId, message.userId);
      kickOk = kicked.ok;
    }
    if (plan.warnUser) {
      await this.safeNotify(() =>
        this.deps.gateway.sendUserMessage(
          message.userId,
          'Сообщение нарушает правила чата. Повторные нарушения усилят ограничение.',
        ),
      );
    }
    if (plan.notifyAdmins) {
      await this.notifyAdmins(
        message.chatId,
        `Модерация ${message.chatId}: пользователь ${message.userId}, ${plan.violationType}, ${plan.severity}, ${plan.reason}`,
      );
    }

    await this.audit.record({
      chatId: message.chatId,
      actorId: 'bot',
      targetUserId: message.userId,
      action: plan.decision.toLowerCase(),
      reason: plan.reason,
      metadata: {
        messageId: message.messageId,
        ruleId: plan.ruleId ?? null,
        severity: plan.severity,
        violationType: plan.violationType,
        deleteOk,
        kickOk,
      },
    });
  }

  private hitFromRule(rule: WordFilter, reason: string): FilterHit {
    return {
      type: rule.type,
      ruleId: rule.id,
      action: rule.action,
      severity: rule.severity,
      reason: `${reason} by rule #${rule.id}`,
    };
  }

  private async collect(hits: FilterHit[], name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.deps.logger.error({ err: error, filter: name, hits: hits.length }, 'filter failed');
    }
  }

  private async loadSettings(chatId: string): Promise<ChatSettings> {
    return this.deps.cache.remember(
      `settings:${chatId}`,
      60,
      () => this.deps.repositories.settings.getOrCreate(chatId),
      (value) => ({
        ...value,
        createdAt: new Date(value.createdAt),
        updatedAt: new Date(value.updatedAt),
      }),
    );
  }

  private async loadFilters(chatId: string): Promise<WordFilter[]> {
    return this.deps.cache.remember(
      `filters:${chatId}`,
      120,
      () => this.deps.repositories.filters.list(chatId, true),
      (value) =>
        value.map((filter) => ({
          ...filter,
          createdAt: new Date(filter.createdAt),
          updatedAt: new Date(filter.updatedAt),
        })),
    );
  }

  private async loadLinks(chatId: string) {
    return this.deps.cache.remember(
      `links:${chatId}`,
      120,
      () => this.deps.repositories.links.list(chatId),
      (value) =>
        value.map((rule) => ({
          ...rule,
          createdAt: new Date(rule.createdAt),
          updatedAt: new Date(rule.updatedAt),
        })),
    );
  }

  private async notifyAdmins(chatId: string, text: string): Promise<void> {
    const recipients = new Set(this.deps.adminIds);
    const admins = await this.deps.gateway.getAdmins(chatId);
    for (const admin of admins) recipients.add(admin.userId);
    for (const userId of [...recipients].slice(0, 10)) {
      await this.safeNotify(() => this.deps.gateway.sendUserMessage(userId, text));
    }
  }

  private async safeNotify(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'notification failed');
    }
  }
}
