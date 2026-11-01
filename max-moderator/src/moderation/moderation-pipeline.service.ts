import { createHash } from 'node:crypto';
import type { CacheStore } from '../cache/cache-store.js';
import { defaultChatSettings, type AppConfig } from '../config/env.js';
import type { Repositories } from '../database/repositories/types.js';
import { ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type { ChatSettingsRecord, FilterHit, IncomingMessage } from '../domain/types.js';
import { logger } from '../utils/logger.js';
import type { Clock } from '../utils/clock.js';
import type { AiModerator } from './ai-moderator.js';
import type { LinkFilterService } from './link-filter.service.js';
import type { PermissionService } from './permissions.service.js';
import { muteHit, type SanctionService } from './sanction.service.js';
import type { SpamFilterService } from './spam-filter.service.js';
import type { WordFilterService } from './word-filter.service.js';
import { SEVERITY_RANK } from '../domain/enums.js';

export interface PipelineResult {
  decision: 'ALLOW' | 'ACT' | 'DUPLICATE';
  reason: string;
}

export class ModerationPipeline {
  constructor(
    private readonly repos: Repositories,
    private readonly permissions: PermissionService,
    private readonly words: WordFilterService,
    private readonly links: LinkFilterService,
    private readonly spam: SpamFilterService,
    private readonly sanctions: SanctionService,
    private readonly ai: AiModerator,
    private readonly clock: Clock,
    private readonly config: Pick<AppConfig, 'defaultLinkMode' | 'defaultWordAction'>,
    private readonly store: CacheStore,
  ) {}

  async handle(message: IncomingMessage): Promise<PipelineResult> {
    if (message.chatType !== 'chat') return { decision: 'ALLOW', reason: 'not_a_group' };
    const hash = contentHash(message);
    const fresh = await this.repos.processed.tryInsert(message.chatId, message.messageId, hash);
    if (!fresh) return { decision: 'DUPLICATE', reason: 'duplicate' };

    try {
      const settings = await this.settingsFor(message.chatId);
      if (!settings.enabled) return { decision: 'ALLOW', reason: 'disabled' };
      const exempt = await this.permissions.exemption(message);
      if (exempt.exempt) return { decision: 'ALLOW', reason: exempt.reason };

      if (
        await this.repos.restrictions.activeMute(message.chatId, message.userId, this.clock.now())
      ) {
        await this.sanctions.apply(message, muteHit('mute_active'), settings, hash);
        return { decision: 'ACT', reason: 'mute_active' };
      }

      const hit = await this.collect(message, settings);
      if (!hit) return { decision: 'ALLOW', reason: 'clean' };
      await this.sanctions.apply(message, hit, settings, hash);
      return { decision: 'ACT', reason: hit.reason };
    } catch (error) {
      logger.error(
        { err: error, chatId: message.chatId, messageId: message.messageId },
        'pipeline failed',
      );
      return { decision: 'ALLOW', reason: 'pipeline_error' };
    }
  }

  private async collect(
    message: IncomingMessage,
    settings: ChatSettingsRecord,
  ): Promise<FilterHit | null> {
    const hits: FilterHit[] = [];
    const linkHit = await this.isolate('links', () =>
      this.links.evaluate(message.chatId, message.links, settings),
    );
    const wordHit = await this.isolate('words', () =>
      this.words.evaluate(message.chatId, message.text, settings),
    );
    const spamHit = await this.isolate('spam', () => this.spam.evaluate(message, settings));
    if (linkHit) hits.push(linkHit);
    if (wordHit) hits.push(wordHit);
    if (spamHit) hits.push(spamHit);
    const decisive = pickHit(hits);
    if (
      decisive &&
      (decisive.effects?.delete ||
        decisive.action === ModerationAction.DELETE ||
        decisive.action === ModerationAction.KICK)
    ) {
      return decisive;
    }
    const aiHit = await this.isolate('ai', () => this.aiHit(message));
    if (aiHit) hits.push(aiHit);
    return pickHit(hits);
  }

  private async aiHit(message: IncomingMessage): Promise<FilterHit | null> {
    const rules = await this.repos.filters.list(message.chatId, true);
    const rule = rules.find((item) => item.type === RuleType.CUSTOM_AI && item.enabled);
    if (!rule) return null;
    const review = await this.ai.review(message.text);
    if (!review?.flagged) return null;
    return {
      type: RuleType.CUSTOM_AI,
      action: rule.action,
      severity: rule.severity ?? Severity.MEDIUM,
      ruleId: rule.id,
      reason: `ai:${review.reason}`,
      priority: 50,
    };
  }

  private async settingsFor(chatId: string): Promise<ChatSettingsRecord> {
    const key = `rules:settings:${chatId}`;
    const cached = await this.store.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as ChatSettingsRecord;
      } catch {
        await this.store.del(key);
      }
    }
    const existing = await this.repos.settings.get(chatId);
    const settings =
      existing ?? (await this.repos.settings.create(defaultChatSettings(chatId, this.config)));
    await this.store.set(key, JSON.stringify(settings), 60);
    return settings;
  }

  private async isolate(
    name: string,
    run: () => Promise<FilterHit | null>,
  ): Promise<FilterHit | null> {
    try {
      return await run();
    } catch (error) {
      logger.error({ err: error, filter: name }, 'filter failed');
      return null;
    }
  }
}

function pickHit(hits: FilterHit[]): FilterHit | null {
  if (hits.length === 0) return null;
  return (
    hits.slice().sort((left, right) => {
      const severity = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
      if (severity !== 0) return severity;
      return left.priority - right.priority;
    })[0] ?? null
  );
}

function contentHash(message: IncomingMessage): string {
  return createHash('sha256')
    .update(
      [
        message.text,
        message.links.map((link) => link.host).join(','),
        message.mediaTypes.join(','),
        String(message.isForward),
      ].join('\n'),
    )
    .digest('hex')
    .slice(0, 32);
}
