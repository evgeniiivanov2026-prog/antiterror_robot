import type { AppConfig } from '../config/env.js';
import { defaultChatSettings } from '../config/defaults.js';
import { Decision, ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type {
  FilterHit,
  IncomingMessage,
  InspectionContext,
  ModerationDecision,
} from '../domain/messages.js';
import type { ChatSettings } from '../domain/models.js';
import type { Repositories } from '../database/repositories/types.js';
import type { AppLogger } from '../utils/logger.js';
import { AuditService } from './audit.service.js';
import { allowDecision, finalizeDecision } from './decisions.js';
import { LinkFilterService } from './link-filter.service.js';
import { PermissionService } from './permissions.js';
import { SanctionService } from './sanction.service.js';
import { SpamFilterService } from './spam-filter.service.js';
import { WordFilterService, type MatchRule } from './word-filter.service.js';

export interface ModerationFilter {
  name: string;
  inspect(ctx: InspectionContext, rules: MatchRule[]): Promise<FilterHit[]>;
}

export interface AiModerator {
  review(ctx: InspectionContext): Promise<FilterHit | null>;
}

export class DisabledAiModerator implements AiModerator {
  async review(): Promise<FilterHit | null> {
    return null;
  }
}

export class ModerationPipeline {
  constructor(
    private readonly deps: {
      repos: Repositories;
      words: WordFilterService;
      links: LinkFilterService;
      spam: SpamFilterService;
      sanctions: SanctionService;
      audit: AuditService;
      permissions: PermissionService;
      logger: AppLogger;
      defaults: Pick<AppConfig, 'defaultLinkMode' | 'defaultWordAction'>;
      now?: () => number;
      extraFilters?: ModerationFilter[];
      ai?: AiModerator;
    },
  ) {}

  async ensureSettings(chatId: string): Promise<ChatSettings> {
    const created = defaultChatSettings(chatId, {
      linkMode: this.deps.defaults.defaultLinkMode,
      wordAction: this.deps.defaults.defaultWordAction,
    });
    const settings = await this.deps.repos.settings.ensure(created);
    if (settings.lexiconSeeded) return settings;
    await this.deps.words.seedLexicon(chatId, 'system:lexicon', settings.defaultAction);
    settings.lexiconSeeded = true;
    return this.deps.repos.settings.save(settings);
  }

  async handle(message: IncomingMessage): Promise<ModerationDecision> {
    if (message.chatType === 'dialog') return allowDecision('dialog');
    if (message.isBot || !message.userId) return allowDecision('bot');

    const settings = await this.ensureSettings(message.chatId);
    if (!settings.enabled) return allowDecision('disabled');
    if (await this.deps.repos.whitelist.has(message.chatId, message.userId))
      return allowDecision('whitelist');

    const privilege = await this.deps.permissions.resolve(message.chatId, message.userId);
    if (privilege === 'privileged') return allowDecision('privileged');
    if (privilege === 'unknown') return allowDecision('privilege_unknown');

    const ctx: InspectionContext = {
      message,
      settings,
      now: this.deps.now?.() ?? message.timestamp,
    };
    const rules = await this.isolate('rules', () => this.deps.words.active(message.chatId));
    const hits: FilterHit[] = [];
    hits.push(...(await this.isolate('links', () => this.deps.links.inspect(ctx))));
    hits.push(...(await this.isolate('words', () => this.deps.words.inspect(ctx))));
    hits.push(...(await this.isolate('spam', () => this.deps.spam.inspect(ctx, rules))));
    hits.push(...(await this.isolate('structural', async () => structuralHits(ctx, rules))));
    hits.push(...(await this.isolate('ai', () => this.runAi(ctx, rules))));
    for (const filter of this.deps.extraFilters ?? []) {
      hits.push(...(await this.isolate(filter.name, () => filter.inspect(ctx, rules))));
    }

    const decision = finalizeDecision(hits, settings);
    if (decision.decision === Decision.ALLOW || !decision.primary) return decision;

    const violation = await this.deps.repos.violations.insertIfNew({
      chatId: message.chatId,
      userId: message.userId,
      messageId: message.messageId,
      ruleId: decision.primary.ruleId,
      violationType: decision.primary.type,
      severity: decision.primary.severity,
      action: decision.primary.action,
      reason: decision.primary.reason,
    });
    if (!violation) return allowDecision('duplicate');

    await this.deps.audit.record({
      chatId: message.chatId,
      actorId: 'bot',
      targetUserId: message.userId,
      action: decision.decision,
      reason: decision.primary.reason,
      metadata: {
        messageId: message.messageId,
        ruleId: decision.primary.ruleId,
        type: decision.primary.type,
        severity: decision.primary.severity,
        pattern: decision.primary.pattern ?? null,
      },
    });

    try {
      await this.deps.sanctions.apply(message, decision);
    } catch (error) {
      this.deps.logger.error(
        { err: error instanceof Error ? error.message : 'sanction', chatId: message.chatId },
        'sanction failed',
      );
    }
    return decision;
  }

  private async runAi(ctx: InspectionContext, rules: MatchRule[]): Promise<FilterHit[]> {
    const enabled = rules.some((rule) => rule.type === RuleType.CUSTOM_AI);
    if (!enabled) return [];
    const hit = await this.deps.ai?.review(ctx);
    return hit ? [hit] : [];
  }

  private async isolate<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.deps.logger.error(
        { err: error instanceof Error ? error.message : 'filter', filter: name },
        'filter failed',
      );
      return [] as T;
    }
  }
}

function structuralHits(ctx: InspectionContext, rules: MatchRule[]): FilterHit[] {
  const hits: FilterHit[] = [];
  if (
    ctx.message.hasMedia &&
    ctx.settings.moderateMedia &&
    !rules.some((rule) => rule.type === RuleType.MEDIA)
  ) {
    hits.push({
      ruleId: null,
      type: RuleType.MEDIA,
      action: ctx.settings.defaultAction,
      severity: Severity.MEDIUM,
      reason: 'media',
    });
  }
  const mediaRule = rules.find((rule) => rule.type === RuleType.MEDIA);
  if (ctx.message.hasMedia && mediaRule) {
    hits.push({
      ruleId: mediaRule.id,
      type: RuleType.MEDIA,
      action: mediaRule.action,
      severity: mediaRule.severity,
      reason: `media:${mediaRule.id}`,
    });
  }
  if (
    ctx.message.isForward &&
    ctx.settings.moderateForwards &&
    !rules.some((rule) => rule.type === RuleType.FORWARD)
  ) {
    hits.push({
      ruleId: null,
      type: RuleType.FORWARD,
      action: ModerationAction.REVIEW,
      severity: Severity.LOW,
      reason: 'forward',
    });
  }
  const forwardRule = rules.find((rule) => rule.type === RuleType.FORWARD);
  if (ctx.message.isForward && forwardRule) {
    hits.push({
      ruleId: forwardRule.id,
      type: RuleType.FORWARD,
      action: forwardRule.action,
      severity: forwardRule.severity,
      reason: `forward:${forwardRule.id}`,
    });
  }
  return hits;
}
