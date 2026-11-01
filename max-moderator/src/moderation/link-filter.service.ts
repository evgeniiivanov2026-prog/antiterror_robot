import { LinkList, LinkMode, ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type {
  ChatSettingsRecord,
  FilterHit,
  IncomingLink,
  LinkRuleRecord,
} from '../domain/types.js';
import { hostMatches } from '../utils/url-extractor.js';
import type { LinkRuleRepository } from '../database/repositories/types.js';
import type { RulesCache } from './rules-cache.js';

export class LinkFilterService {
  constructor(
    private readonly rules: LinkRuleRepository,
    private readonly cache: RulesCache,
  ) {}

  async evaluate(
    chatId: string,
    links: IncomingLink[],
    settings: ChatSettingsRecord,
  ): Promise<FilterHit | null> {
    if (links.length === 0) return null;
    const rules = await this.cache.getLinks(chatId, () => this.rules.list(chatId));
    let review: FilterHit | null = null;
    for (const link of links) {
      const decision = classify(link, rules, settings.linkMode);
      if (decision.kind === 'allow') continue;
      if (decision.kind === 'deny') {
        return {
          type: RuleType.LINK_DOMAIN,
          action: decision.action,
          severity: decision.action === ModerationAction.REVIEW ? Severity.MEDIUM : Severity.HIGH,
          ruleId: decision.ruleId,
          reason: `link:${link.host}`,
          priority: 10,
        };
      }
      review ??= {
        type: RuleType.LINK_DOMAIN,
        action: ModerationAction.REVIEW,
        severity: Severity.MEDIUM,
        ruleId: null,
        reason: `link_review:${link.host}`,
        priority: 10,
      };
    }
    return review;
  }
}

function classify(
  link: IncomingLink,
  rules: LinkRuleRecord[],
  mode: LinkMode,
): { kind: 'allow' | 'deny' | 'review'; action: ModerationAction; ruleId: number | null } {
  const deny = mostSpecific(
    rules.filter((rule) => rule.list === LinkList.DENY && hostMatches(link.host, rule.domain)),
  );
  const allow = mostSpecific(
    rules.filter((rule) => rule.list === LinkList.ALLOW && hostMatches(link.host, rule.domain)),
  );
  if (deny && allow) {
    if (deny.domain.length >= allow.domain.length) {
      return { kind: 'deny', action: deny.action, ruleId: deny.id };
    }
    return { kind: 'allow', action: ModerationAction.DELETE, ruleId: allow.id };
  }
  if (deny) return { kind: 'deny', action: deny.action, ruleId: deny.id };
  if (allow) return { kind: 'allow', action: ModerationAction.DELETE, ruleId: allow.id };
  if (link.suspicious || mode === LinkMode.REVIEW)
    return { kind: 'review', action: ModerationAction.REVIEW, ruleId: null };
  if (mode === LinkMode.DENY)
    return { kind: 'deny', action: ModerationAction.DELETE, ruleId: null };
  return { kind: 'allow', action: ModerationAction.DELETE, ruleId: null };
}

function mostSpecific(rules: LinkRuleRecord[]): LinkRuleRecord | undefined {
  return rules.slice().sort((left, right) => right.domain.length - left.domain.length)[0];
}
