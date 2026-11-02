export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

const RANK: Record<Severity, number> = {
  [Severity.LOW]: 1,
  [Severity.MEDIUM]: 2,
  [Severity.HIGH]: 3,
  [Severity.CRITICAL]: 4,
};

export function severityRank(severity: Severity): number {
  return RANK[severity];
}

export function parseSeverity(value: string): Severity | null {
  const normalized = value.trim().toUpperCase();
  if (normalized in RANK) return normalized as Severity;
  return null;
}
