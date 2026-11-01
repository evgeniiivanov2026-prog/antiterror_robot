import { createHash } from 'node:crypto';
import type { CacheStore } from '../cache/cache-store.js';
import type { ViolationRepository } from '../database/repositories/types.js';
import { ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type { ChatSettingsRecord, Effects, FilterHit, IncomingMessage } from '../domain/types.js';
import type { Clock } from '../utils/clock.js';
import { letterStats } from '../utils/text-normalizer.js';
import { emptyEffects } from './effects.js';

const SPAM_TYPES = [
  RuleType.FLOOD,
  RuleType.CAPS,
  RuleType.MENTION_SPAM,
  RuleType.SPAM_PATTERN,
  RuleType.MEDIA,
  RuleType.FORWARD,
];

export class SpamFilterService {
  constructor(
    private readonly store: CacheStore,
    private readonly violations: ViolationRepository,
    private readonly clock: Clock,
  ) {}

  async evaluate(
    message: IncomingMessage,
    settings: ChatSettingsRecord,
  ): Promise<FilterHit | null> {
    const hits: FilterHit[] = [];
    if (settings.floodEnabled) {
      const count = await this.store.addWindowEvent(
        `flood:${message.chatId}:${message.userId}`,
        this.clock.now(),
        settings.floodWindowSec * 1000,
        message.messageId,
      );
      if (count >= settings.floodMaxMessages)
        hits.push(await this.graduated(message, RuleType.FLOOD, 'flood'));
    }
    if (settings.repeatEnabled && [...message.text].length >= 8) {
      const hash = createHash('sha256').update(message.text).digest('hex').slice(0, 16);
      const count = await this.store.incr(
        `repeat:${message.chatId}:${message.userId}:${hash}`,
        settings.repeatWindowSec,
      );
      if (count >= settings.repeatMax)
        hits.push(await this.graduated(message, RuleType.SPAM_PATTERN, 'repeat'));
    }
    if (settings.capsEnabled && isCaps(message.text, settings.capsRatio, settings.capsMinLength)) {
      hits.push(await this.graduated(message, RuleType.CAPS, 'caps'));
    }
    if (settings.mentionEnabled && message.mentionCount >= settings.mentionMax) {
      hits.push(await this.graduated(message, RuleType.MENTION_SPAM, 'mentions'));
    }
    const media = policyHit(settings.mediaMode, RuleType.MEDIA, 'media');
    if (message.mediaTypes.length > 0 && media) hits.push(media);
    const forward = policyHit(settings.forwardMode, RuleType.FORWARD, 'forward');
    if (message.isForward && forward) hits.push(forward);
    return hits[0] ?? null;
  }

  private async graduated(
    message: IncomingMessage,
    type: RuleType,
    reason: string,
  ): Promise<FilterHit> {
    const since = this.clock.now() - 24 * 60 * 60 * 1000;
    const strikes = await this.violations.countSince(
      message.chatId,
      message.userId,
      SPAM_TYPES,
      since,
    );
    const effects = strikeEffects(strikes);
    const action = effects.kick
      ? ModerationAction.KICK
      : effects.mute
        ? ModerationAction.MUTE
        : effects.delete
          ? ModerationAction.DELETE
          : effects.notify
            ? ModerationAction.NOTIFY_ADMINS
            : ModerationAction.WARN;
    return {
      type,
      action,
      severity: strikes >= 3 ? Severity.HIGH : Severity.MEDIUM,
      ruleId: null,
      reason: `${reason}:strike${strikes + 1}`,
      priority: 30,
      effects,
    };
  }
}

function strikeEffects(previousStrikes: number): Effects {
  const effects = emptyEffects();
  if (previousStrikes <= 0) {
    effects.warn = true;
    return effects;
  }
  if (previousStrikes === 1) {
    effects.delete = true;
    return effects;
  }
  if (previousStrikes === 2) {
    effects.delete = true;
    effects.mute = true;
    return effects;
  }
  effects.delete = true;
  effects.mute = true;
  effects.notify = true;
  return effects;
}

function isCaps(text: string, ratio: number, minLength: number): boolean {
  const stats = letterStats(text);
  if (stats.length <= minLength || stats.letters === 0) return false;
  return stats.upper / stats.letters > ratio;
}

function policyHit(
  mode: ChatSettingsRecord['mediaMode'],
  type: RuleType,
  reason: string,
): FilterHit | null {
  if (mode === 'off') return null;
  const action =
    mode === 'delete'
      ? ModerationAction.DELETE
      : mode === 'warn'
        ? ModerationAction.WARN
        : ModerationAction.REVIEW;
  return {
    type,
    action,
    severity: mode === 'delete' ? Severity.MEDIUM : Severity.LOW,
    ruleId: null,
    reason,
    priority: 40,
  };
}
