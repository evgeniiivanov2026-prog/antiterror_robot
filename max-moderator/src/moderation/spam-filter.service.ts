import type { KeyValue } from '../database/cache.js';
import { capsStats } from '../utils/text-normalizer.js';
import { normalizeForRegex } from '../utils/text-normalizer.js';
import { Severity } from './severity.js';
import { ModerationAction, type ChatSettings, type FilterHit } from './types.js';

interface HistoryEntry {
  ts: number;
  hash: string;
}

export class SpamFilterService {
  constructor(
    private readonly kv: KeyValue,
    private readonly now: () => number,
  ) {}

  async inspect(input: {
    chatId: string;
    userId: string;
    text: string;
    mentionCount: number;
    settings: ChatSettings;
  }): Promise<FilterHit | null> {
    if (!input.settings.spamEnabled) return null;
    const now = this.now();
    const hash = normalizeForRegex(input.text).slice(0, 200);
    const history = await this.readHistory(
      input.chatId,
      input.userId,
      now,
      input.settings.floodWindowSec,
    );
    history.push({ ts: now, hash });
    await this.writeHistory(input.chatId, input.userId, history, input.settings.floodWindowSec);

    const signals: string[] = [];
    if (history.length > input.settings.floodMax) signals.push('FLOOD');
    const caps = capsStats(input.text);
    if (
      input.settings.capsEnabled &&
      caps.letters >= input.settings.capsMinLength &&
      caps.ratio >= input.settings.capsRatio
    ) {
      signals.push('CAPS');
    }
    if (input.mentionCount > input.settings.mentionMax) signals.push('MENTION_SPAM');
    const duplicates = history.filter(
      (entry) => entry.hash.length > 0 && entry.hash === hash,
    ).length;
    if (hash.length > 0 && duplicates >= input.settings.duplicateThreshold)
      signals.push('SPAM_PATTERN');
    if (signals.length === 0) return null;

    const strikes = await this.incrementStrikes(input.chatId, input.userId);
    const graduated = this.graduate(strikes);
    const first = signals[0] ?? 'FLOOD';
    return {
      type: first,
      action: graduated.action,
      severity: graduated.severity,
      reason: `spam signals: ${signals.join(', ')} (strike ${strikes})`,
    };
  }

  private graduate(strikes: number): { action: ModerationAction; severity: Severity } {
    if (strikes <= 1) return { action: ModerationAction.WARN, severity: Severity.LOW };
    if (strikes === 2) return { action: ModerationAction.DELETE, severity: Severity.MEDIUM };
    if (strikes === 3) return { action: ModerationAction.MUTE, severity: Severity.HIGH };
    return { action: ModerationAction.DELETE, severity: Severity.CRITICAL };
  }

  private historyKey(chatId: string, userId: string): string {
    return `spam:${chatId}:${userId}`;
  }

  private strikeKey(chatId: string, userId: string): string {
    return `strikes:${chatId}:${userId}`;
  }

  private async readHistory(
    chatId: string,
    userId: string,
    now: number,
    windowSec: number,
  ): Promise<HistoryEntry[]> {
    const raw = await this.kv.get(this.historyKey(chatId, userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is HistoryEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<HistoryEntry>;
      return (
        typeof candidate.ts === 'number' &&
        typeof candidate.hash === 'string' &&
        now - candidate.ts <= windowSec * 1000
      );
    });
  }

  private async writeHistory(
    chatId: string,
    userId: string,
    history: HistoryEntry[],
    windowSec: number,
  ): Promise<void> {
    await this.kv.set(
      this.historyKey(chatId, userId),
      JSON.stringify(history.slice(-50)),
      windowSec + 5,
    );
  }

  private async incrementStrikes(chatId: string, userId: string): Promise<number> {
    const key = this.strikeKey(chatId, userId);
    const current = Number((await this.kv.get(key)) ?? '0');
    const next = (Number.isFinite(current) ? current : 0) + 1;
    await this.kv.set(key, String(next), 60 * 60);
    return next;
  }
}
