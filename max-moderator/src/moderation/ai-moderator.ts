export interface AiReview {
  flagged: boolean;
  reason: string;
}

export class AiModerator {
  constructor(
    private readonly url: string | undefined,
    private readonly fetchFn: typeof fetch,
  ) {}

  async review(text: string): Promise<AiReview | null> {
    if (!this.url || !text.trim()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 2000) }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { flagged?: unknown; reason?: unknown };
      if (data.flagged !== true) return null;
      const reason = typeof data.reason === 'string' ? data.reason.slice(0, 120) : 'ai';
      return { flagged: true, reason };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
