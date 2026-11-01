export class MaxApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, message: string, retryable: boolean) {
    super(message);
    this.name = 'MaxApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts: number;
    baseDelayMs: number;
    sleep: (ms: number) => Promise<void>;
    retryable: (error: unknown) => boolean;
  },
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      const finalAttempt = attempt === options.attempts - 1;
      if (!options.retryable(error) || finalAttempt) throw error;
      await options.sleep(options.baseDelayMs * 2 ** attempt);
    }
  }
  throw last;
}
