import type { Logger } from '../utils/logger.js';
import { Severity } from './severity.js';
import { ModerationAction, type FilterHit } from './types.js';

export interface AiModerator {
  review(text: string): Promise<FilterHit | null>;
}

export class DisabledAiModerator implements AiModerator {
  async review(): Promise<FilterHit | null> {
    return null;
  }
}

export class HttpAiModerator implements AiModerator {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly logger: Logger,
  ) {}

  async review(text: string): Promise<FilterHit | null> {
    if (!this.url || text.trim().length === 0) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: text.slice(0, 4000) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status }, 'ai moderation request failed');
        return null;
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('flagged' in payload)) return null;
      if (!(payload as { flagged?: unknown }).flagged) return null;
      const reasonValue = (payload as { reason?: unknown }).reason;
      const reason = typeof reasonValue === 'string' ? reasonValue.slice(0, 200) : 'ai review';
      return {
        type: 'CUSTOM_AI',
        action: ModerationAction.REVIEW,
        severity: Severity.MEDIUM,
        reason: `custom ai: ${reason}`,
      };
    } catch (error) {
      this.logger.warn({ err: error }, 'ai moderation unavailable');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
