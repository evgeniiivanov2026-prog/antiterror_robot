import { Severity } from './severity.js';
import { FilterType, ModerationAction, type FilterHit, type WordFilter } from './types.js';
import {
  buildFlexiblePattern,
  normalizeForRegex,
  normalizeForWords,
} from '../utils/text-normalizer.js';
import { compileUserRegex, execUserRegex, UnsafeRegexError } from '../utils/safe-regex.js';

const WORD_TYPES = new Set<FilterType>([
  FilterType.WORD,
  FilterType.SPAM_PATTERN,
  FilterType.REGEX,
]);

export class WordFilterService {
  match(originalText: string, rules: WordFilter[]): FilterHit[] {
    const folded = normalizeForWords(originalText);
    const plain = normalizeForRegex(originalText);
    const hits: FilterHit[] = [];
    for (const rule of rules) {
      if (!rule.enabled || !WORD_TYPES.has(rule.type)) continue;
      try {
        if (!this.ruleMatches(rule, folded, plain)) continue;
        hits.push({
          type: rule.type,
          ruleId: rule.id,
          action: rule.action,
          severity: rule.severity,
          reason: `${rule.type} filter #${rule.id} matched`,
        });
      } catch (error) {
        if (!(error instanceof UnsafeRegexError)) throw error;
      }
    }
    return hits;
  }

  private ruleMatches(rule: WordFilter, folded: string, plain: string): boolean {
    if (rule.type === FilterType.REGEX) {
      const regex = compileUserRegex(rule.pattern);
      return execUserRegex(regex, plain) || execUserRegex(regex, folded);
    }
    const normalized = normalizeForWords(rule.pattern);
    if (normalized.length < 2) return false;
    const source = buildFlexiblePattern(normalized, rule.wholeWord);
    return new RegExp(source, 'u').test(folded);
  }
}

export function defaultSeverity(): Severity {
  return Severity.LOW;
}

export function defaultFilterAction(action: ModerationAction): ModerationAction {
  return action;
}
