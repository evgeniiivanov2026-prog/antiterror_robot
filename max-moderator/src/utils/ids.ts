export function parseUserId(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^[1-9]\d{0,18}$/.test(trimmed)) return null;
  return trimmed;
}

export function toSafeInteger(value: string, label: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${label} is not an integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} is outside the safe integer range`);
  }
  return number;
}

export function parsePositiveInt(value: string | undefined, max: number): number | null {
  const trimmed = value?.trim() ?? '';
  if (!/^[1-9]\d{0,8}$/.test(trimmed)) return null;
  const number = Number(trimmed);
  if (number > max) return null;
  return number;
}
