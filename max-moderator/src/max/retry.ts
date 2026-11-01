export function isRetryableStatus(status: number, idempotent: boolean): boolean {
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return idempotent;
  return false;
}

export function backoffMs(attempt: number): number {
  return 200 * 2 ** attempt;
}
