import type { KeyValueCache } from '../cache/cache.js';
import { ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type { FilterHit, InspectionContext } from '../domain/messages.js';
import type { NewWordFilter, WordFilter } from '../domain/models.js';
import type { FilterRepository } from '../database/repositories/types.js';
import { compileUserRegex, testUserRegex, UnsafeRegexError } from '../utils/safe-regex.js';
import { foldText, matchesPattern } from '../utils/text-normalizer.js';
import { DEFAULT_LEXICON } from './lexicon.js';

export interface MatchRule {
  id: number;
  type: RuleType;
  pattern: string;
  action: ModerationAction;
  severity: Severity;
  wholeWord: boolean;
}

const CACHE_TTL_SECONDS = 300;

export class WordFilterService {
  constructor(
    private readonly filters: FilterRepository,
    private readonly cache: KeyValueCache,
  ) {}

  async list(chatId: string): Promise<WordFilter[]> {
    return this.filters.list(chatId, false);
  }

  async active(chatId: string): Promise<MatchRule[]> {
    const cacheKey = this.cacheKey(chatId);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed as MatchRule[];
    }
    const rows = await this.filters.list(chatId, true);
    const rules = rows.map(toMatchRule);
    await this.cache.set(cacheKey, JSON.stringify(rules), CACHE_TTL_SECONDS);
    return rules;
  }

  async add(input: NewWordFilter): Promise<WordFilter> {
    if (input.type === RuleType.REGEX) compileUserRegex(input.pattern);
    const created = await this.filters.create(input);
    await this.invalidate(input.chatId);
    return created;
  }

  async remove(chatId: string, id: number): Promise<boolean> {
    const removed = await this.filters.delete(chatId, id);
    if (removed) await this.invalidate(chatId);
    return removed;
  }

  async setEnabled(chatId: string, id: number, enabled: boolean): Promise<WordFilter | null> {
    const current = await this.filters.findById(chatId, id);
    if (!current) return null;
    const saved = await this.filters.save({ ...current, enabled });
    await this.invalidate(chatId);
    return saved;
  }

  async setAction(
    chatId: string,
    id: number,
    action: ModerationAction,
  ): Promise<WordFilter | null> {
    const current = await this.filters.findById(chatId, id);
    if (!current) return null;
    const saved = await this.filters.save({ ...current, action });
    await this.invalidate(chatId);
    return saved;
  }

  async setSeverity(chatId: string, id: number, severity: Severity): Promise<WordFilter | null> {
    const current = await this.filters.findById(chatId, id);
    if (!current) return null;
    const saved = await this.filters.save({ ...current, severity });
    await this.invalidate(chatId);
    return saved;
  }

  async importLines(
    chatId: string,
    lines: string[],
    createdBy: string,
    defaults: { action: ModerationAction; severity: Severity; wholeWord: boolean },
  ): Promise<number> {
    let count = 0;
    for (const line of lines) {
      const pattern = line.trim();
      if (pattern.length < 2 || pattern.length > 200) continue;
      await this.filters.create({
        chatId,
        type: RuleType.WORD,
        pattern,
        action: defaults.action,
        severity: defaults.severity,
        wholeWord: defaults.wholeWord,
        createdBy,
      });
      count += 1;
    }
    if (count > 0) await this.invalidate(chatId);
    return count;
  }

  async clear(chatId: string): Promise<number> {
    const count = await this.filters.deleteAll(chatId);
    await this.invalidate(chatId);
    return count;
  }

  async seedLexicon(chatId: string, createdBy: string, action: ModerationAction): Promise<number> {
    const existing = await this.filters.list(chatId, false);
    const known = new Set(
      existing.filter((row) => row.type === RuleType.WORD).map((row) => row.pattern),
    );
    let count = 0;
    for (const entry of DEFAULT_LEXICON) {
      if (known.has(entry.pattern)) continue;
      await this.filters.create({
        chatId,
        type: RuleType.WORD,
        pattern: entry.pattern,
        action,
        severity: Severity.MEDIUM,
        wholeWord: entry.wholeWord,
        createdBy,
        enabled: true,
      });
      count += 1;
    }
    if (count > 0) await this.invalidate(chatId);
    return count;
  }

  async inspect(ctx: InspectionContext): Promise<FilterHit[]> {
    const rules = await this.active(ctx.message.chatId);
    const hits: FilterHit[] = [];
    const folded = foldText(ctx.message.text);
    for (const rule of rules) {
      if (
        rule.type !== RuleType.WORD &&
        rule.type !== RuleType.REGEX &&
        rule.type !== RuleType.SPAM_PATTERN
      ) {
        continue;
      }
      if (this.matches(rule, ctx.message.text, folded)) {
        hits.push({
          ruleId: rule.id,
          type: rule.type,
          action: rule.action,
          severity: rule.severity,
          reason: `${rule.type.toLowerCase()}:${rule.id}`,
          pattern: rule.pattern,
        });
      }
    }
    return hits;
  }

  private matches(rule: MatchRule, text: string, folded: string): boolean {
    if (rule.type === RuleType.REGEX) {
      try {
        const expression = compileUserRegex(rule.pattern);
        return testUserRegex(expression, text) || testUserRegex(expression, folded);
      } catch (error) {
        if (error instanceof UnsafeRegexError) return false;
        throw error;
      }
    }
    return matchesPattern(text, rule.pattern, rule.wholeWord);
  }

  private cacheKey(chatId: string): string {
    return `filters:${chatId}`;
  }

  private async invalidate(chatId: string): Promise<void> {
    await this.cache.del(this.cacheKey(chatId));
  }
}

function toMatchRule(row: WordFilter): MatchRule {
  return {
    id: row.id,
    type: row.type,
    pattern: row.pattern,
    action: row.action,
    severity: row.severity,
    wholeWord: row.wholeWord,
  };
}
