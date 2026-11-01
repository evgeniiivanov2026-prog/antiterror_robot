import { RuleType, SEVERITY_RANK } from '../domain/enums.js';
import type { ChatSettingsRecord, FilterHit, WordFilterRecord } from '../domain/types.js';
import { logger } from '../utils/logger.js';
import { testUserRegex } from '../utils/regex-guard.js';
import { normalizeText, matchesTerm } from '../utils/text-normalizer.js';
import type { RulesCache } from './rules-cache.js';
import type { WordFilterRepository } from '../database/repositories/types.js';

const TEXT_TYPES = new Set<RuleType>([RuleType.WORD, RuleType.REGEX, RuleType.SPAM_PATTERN]);

export class WordFilterService {
  constructor(
    private readonly filters: WordFilterRepository,
    private readonly cache: RulesCache,
  ) {}

  async evaluate(
    chatId: string,
    text: string,
    settings: ChatSettingsRecord,
  ): Promise<FilterHit | null> {
    if (!text.trim()) return null;
    const rules = await this.cache.getFilters(chatId, () => this.filters.list(chatId, true));
    const normalized = normalizeText(text);
    let best: FilterHit | null = null;
    for (const rule of rules) {
      if (!rule.enabled || !TEXT_TYPES.has(rule.type)) continue;
      const matched = this.safeMatch(rule, text, normalized, settings.wholeWord);
      if (!matched) continue;
      const hit: FilterHit = {
        type: rule.type,
        action: rule.action,
        severity: rule.severity,
        ruleId: rule.id,
        reason: `${rule.type.toLowerCase()}:${rule.id}`,
        priority: 20,
      };
      if (!best || SEVERITY_RANK[hit.severity] > SEVERITY_RANK[best.severity]) best = hit;
    }
    return best;
  }

  private safeMatch(
    rule: WordFilterRecord,
    raw: string,
    normalized: string,
    wholeWord: boolean,
  ): boolean {
    try {
      if (rule.type === RuleType.REGEX) {
        return (
          testUserRegex(rule.pattern, normalized) ||
          testUserRegex(rule.pattern, raw.toLocaleLowerCase('ru'))
        );
      }
      return matchesTerm(raw, rule.pattern, wholeWord);
    } catch (error) {
      logger.warn({ err: error, ruleId: rule.id, chatId: rule.chatId }, 'word filter skipped');
      return false;
    }
  }
}
