import type { KeyValueCache } from '../cache/cache.js';
import { LinkList, LinkMode, ModerationAction, RuleType, Severity } from '../domain/enums.js';
import type { FilterHit, InspectionContext } from '../domain/messages.js';
import type { LinkRule } from '../domain/models.js';
import type { LinkRuleRepository } from '../database/repositories/types.js';
import { describeLink, hostMatches, normalizeHost } from '../utils/url-extractor.js';

const CACHE_TTL_SECONDS = 300;

export class LinkFilterService {
  constructor(
    private readonly rules: LinkRuleRepository,
    private readonly cache: KeyValueCache,
  ) {}

  async list(chatId: string): Promise<LinkRule[]> {
    return this.rules.list(chatId);
  }

  async add(
    chatId: string,
    rawDomain: string,
    list: LinkList,
    action: ModerationAction,
  ): Promise<LinkRule | null> {
    const domain = normalizeHost(rawDomain);
    if (!domain) return null;
    const saved = await this.rules.upsert({ chatId, domain, list, action });
    await this.cache.del(this.cacheKey(chatId));
    return saved;
  }

  async remove(chatId: string, rawDomain: string): Promise<boolean> {
    const domain = normalizeHost(rawDomain);
    if (!domain) return false;
    const removed = await this.rules.delete(chatId, domain);
    if (removed) await this.cache.del(this.cacheKey(chatId));
    return removed;
  }

  async inspect(ctx: InspectionContext): Promise<FilterHit[]> {
    if (ctx.message.urls.length === 0) return [];
    const rules = await this.cached(ctx.message.chatId);
    const hits: FilterHit[] = [];
    for (const raw of ctx.message.urls) {
      const link = describeLink(raw);
      if (!link) continue;
      const trusted = rules.find(
        (rule) => rule.list === LinkList.WHITELIST && hostMatches(link.host, rule.domain),
      );
      if (trusted) continue;
      const blocked = rules.find(
        (rule) => rule.list === LinkList.BLACKLIST && hostMatches(link.host, rule.domain),
      );
      if (blocked) {
        hits.push({
          ruleId: blocked.id,
          type: RuleType.LINK_DOMAIN,
          action: blocked.action,
          severity: Severity.HIGH,
          reason: `blacklist:${link.host}`,
          pattern: blocked.domain,
        });
        continue;
      }
      const unknown = this.unknownHit(ctx, link.host, link.suspicious);
      if (unknown) hits.push(unknown);
    }
    return hits;
  }

  private unknownHit(ctx: InspectionContext, host: string, suspicious: boolean): FilterHit | null {
    if (ctx.settings.linkMode === LinkMode.ALLOW && !suspicious) return null;
    if (ctx.settings.linkMode === LinkMode.ALLOW && suspicious) {
      return {
        ruleId: null,
        type: RuleType.LINK_DOMAIN,
        action: ModerationAction.REVIEW,
        severity: Severity.MEDIUM,
        reason: `suspicious:${host}`,
        pattern: host,
      };
    }
    if (ctx.settings.linkMode === LinkMode.DENY) {
      const action =
        ctx.settings.defaultAction === ModerationAction.REVIEW
          ? ModerationAction.REVIEW
          : ModerationAction.DELETE;
      return {
        ruleId: null,
        type: RuleType.LINK_DOMAIN,
        action,
        severity: Severity.MEDIUM,
        reason: `deny:${host}`,
        pattern: host,
      };
    }
    return {
      ruleId: null,
      type: RuleType.LINK_DOMAIN,
      action: ModerationAction.REVIEW,
      severity: Severity.LOW,
      reason: `review:${host}`,
      pattern: host,
    };
  }

  private async cached(chatId: string): Promise<LinkRule[]> {
    const cached = await this.cache.get(this.cacheKey(chatId));
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed as LinkRule[];
    }
    const rows = await this.rules.list(chatId);
    await this.cache.set(this.cacheKey(chatId), JSON.stringify(rows), CACHE_TTL_SECONDS);
    return rows;
  }

  private cacheKey(chatId: string): string {
    return `links:${chatId}`;
  }
}
