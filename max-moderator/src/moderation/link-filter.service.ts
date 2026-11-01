import { Severity } from './severity.js';
import { ModerationAction, type ChatSettings, type FilterHit, type LinkRule } from './types.js';
import { domainMatches, extractUrls, type ExtractedUrl } from '../utils/url-extractor.js';

export class LinkFilterService {
  inspect(
    texts: string[],
    explicitUrls: string[],
    rules: LinkRule[],
    settings: ChatSettings,
  ): FilterHit | null {
    const urls = [
      ...texts.flatMap((text) => extractUrls(text)),
      ...explicitUrls.flatMap((url) => extractUrls(url)),
    ];
    if (urls.length === 0) return null;
    const whitelist = rules.filter((rule) => rule.list === 'whitelist');
    const blacklist = rules.filter((rule) => rule.list === 'blacklist');
    let review: ExtractedUrl | null = null;

    for (const url of urls) {
      if (whitelist.some((rule) => domainMatches(url.host, rule.domain))) continue;
      const blocked = blacklist.find((rule) => domainMatches(url.host, rule.domain));
      if (blocked) {
        return {
          type: 'LINK_DOMAIN',
          ruleId: blocked.id,
          action: blocked.action,
          severity: blocked.action === ModerationAction.REVIEW ? Severity.MEDIUM : Severity.HIGH,
          reason: `blacklisted domain ${blocked.domain}`,
        };
      }
      if (settings.linkMode === 'allow' && !url.suspicious) continue;
      if (!review) review = url;
    }

    if (!review) return null;
    if (settings.linkMode === 'deny') {
      return {
        type: 'LINK_DOMAIN',
        action: ModerationAction.DELETE,
        severity: Severity.MEDIUM,
        reason: review.reason
          ? `link denied (${review.reason}): ${review.host}`
          : `link denied: ${review.host}`,
      };
    }
    return {
      type: 'LINK_DOMAIN',
      action: ModerationAction.REVIEW,
      severity: Severity.MEDIUM,
      reason: review.reason
        ? `link needs review (${review.reason}): ${review.host}`
        : `unknown link: ${review.host}`,
    };
  }
}
