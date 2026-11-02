const sleepDefault = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class ChatRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly options: {
      limitPerSecond: number;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  acquire(chatId: string): Promise<void> {
    const previous = this.tails.get(chatId) ?? Promise.resolve();
    const next = previous.then(() => this.reserve(chatId));
    this.tails.set(
      chatId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private async reserve(chatId: string): Promise<void> {
    const nowFn = this.options.now ?? Date.now;
    const sleep = this.options.sleep ?? sleepDefault;
    const limit = this.options.limitPerSecond;
    for (;;) {
      const now = nowFn();
      const recent = (this.hits.get(chatId) ?? []).filter((stamp) => now - stamp < 1000);
      if (recent.length < limit) {
        recent.push(now);
        this.hits.set(chatId, recent);
        return;
      }
      const oldest = recent[0] ?? now;
      const wait = Math.max(1, 1000 - (now - oldest) + 1);
      await sleep(wait);
    }
  }
}
