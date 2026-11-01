import { ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type { FilterHit, InspectionContext } from '../domain/messages.js';
import type { MatchRule } from './word-filter.service.js';
import { capsRatio, foldText } from '../utils/text-normalizer.js';

export interface SpamSnapshot {
  total: number;
  identical: number;
}

export interface SpamTracker {
  record(
    chatId: string,
    userId: string,
    fingerprint: string,
    now: number,
    windowMs: number,
  ): Promise<SpamSnapshot>;
  bumpStrike(chatId: string, userId: string, now: number): Promise<number>;
}

interface SpamEvent {
  at: number;
  fingerprint: string;
}

export class MemorySpamTracker implements SpamTracker {
  private readonly events = new Map<string, SpamEvent[]>();
  private readonly strikes = new Map<string, { count: number; at: number }>();

  async record(
    chatId: string,
    userId: string,
    fingerprint: string,
    now: number,
    windowMs: number,
  ): Promise<SpamSnapshot> {
    const key = `${chatId}:${userId}`;
    const kept = (this.events.get(key) ?? []).filter((event) => now - event.at <= windowMs);
    kept.push({ at: now, fingerprint });
    this.events.set(key, kept);
    return {
      total: kept.length,
      identical: kept.filter((event) => event.fingerprint === fingerprint).length,
    };
  }

  async bumpStrike(chatId: string, userId: string, now: number): Promise<number> {
    const key = `${chatId}:${userId}`;
    const current = this.strikes.get(key);
    const fresh = !current || now - current.at > 60 * 60 * 1000;
    const count = fresh ? 1 : current.count + 1;
    this.strikes.set(key, { count, at: now });
    return count;
  }
}

export class SpamFilterService {
  constructor(private readonly tracker: SpamTracker) {}

  async inspect(ctx: InspectionContext, rules: MatchRule[]): Promise<FilterHit[]> {
    const hits: FilterHit[] = [];
    const fingerprint = foldText(ctx.message.text).slice(0, 200);
    const windowMs = Math.max(ctx.settings.floodWindowMs, 1_000);
    const snapshot = await this.tracker.record(
      ctx.message.chatId,
      ctx.message.userId,
      fingerprint,
      ctx.now,
      windowMs,
    );

    const flood =
      ctx.settings.moderateFlood && snapshot.total >= Math.max(ctx.settings.floodLimit, 2);
    const repeat =
      ctx.settings.moderateFlood &&
      fingerprint.length > 0 &&
      snapshot.identical >= Math.max(ctx.settings.repeatLimit, 2);
    const caps = this.capsHit(ctx, rules);
    const mentions = this.mentionHit(ctx, rules);

    if (flood || repeat) {
      const strike = await this.tracker.bumpStrike(ctx.message.chatId, ctx.message.userId, ctx.now);
      const graduated = graduate(strike);
      if (flood) {
        hits.push(this.withRule(rules, RuleType.FLOOD, graduated, `flood:${snapshot.total}`));
      }
      if (repeat) {
        hits.push({
          ruleId: null,
          type: RuleType.FLOOD,
          action: graduated.action,
          severity: graduated.severity,
          reason: `repeat:${snapshot.identical}`,
        });
      }
    }
    if (caps) hits.push(caps);
    if (mentions) hits.push(mentions);
    return hits;
  }

  private capsHit(ctx: InspectionContext, rules: MatchRule[]): FilterHit | null {
    if (!ctx.settings.moderateCaps) return null;
    const stats = capsRatio(ctx.message.text);
    if (stats.letters < ctx.settings.capsMinLength) return null;
    if (stats.ratio + 1e-9 < ctx.settings.capsRatio) return null;
    const rule = rules.find((item) => item.type === RuleType.CAPS);
    return {
      ruleId: rule?.id ?? null,
      type: RuleType.CAPS,
      action: rule?.action ?? ModerationAction.DELETE,
      severity: rule?.severity ?? Severity.LOW,
      reason: `caps:${stats.ratio.toFixed(2)}`,
    };
  }

  private mentionHit(ctx: InspectionContext, rules: MatchRule[]): FilterHit | null {
    if (!ctx.settings.moderateMentions) return null;
    if (ctx.message.mentionCount < Math.max(ctx.settings.mentionLimit, 2)) return null;
    const rule = rules.find((item) => item.type === RuleType.MENTION_SPAM);
    const strikeAction =
      ctx.message.mentionCount >= ctx.settings.mentionLimit * 2
        ? ModerationAction.DELETE
        : ModerationAction.WARN;
    return {
      ruleId: rule?.id ?? null,
      type: RuleType.MENTION_SPAM,
      action: rule?.action ?? strikeAction,
      severity: rule?.severity ?? Severity.MEDIUM,
      reason: `mentions:${ctx.message.mentionCount}`,
    };
  }

  private withRule(
    rules: MatchRule[],
    type: RuleType,
    fallback: { action: ModerationAction; severity: Severity },
    reason: string,
  ): FilterHit {
    const rule = rules.find((item) => item.type === type);
    return {
      ruleId: rule?.id ?? null,
      type,
      action: rule?.action ?? fallback.action,
      severity: rule?.severity ?? fallback.severity,
      reason,
    };
  }
}

export function graduate(strike: number): { action: ModerationAction; severity: Severity } {
  if (strike <= 1) return { action: ModerationAction.WARN, severity: Severity.LOW };
  if (strike === 2) return { action: ModerationAction.DELETE, severity: Severity.MEDIUM };
  if (strike === 3) return { action: ModerationAction.MUTE, severity: Severity.HIGH };
  return { action: ModerationAction.DELETE, severity: Severity.CRITICAL };
}
