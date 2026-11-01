export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ModerationAction {
  DELETE = 'DELETE',
  WARN = 'WARN',
  MUTE = 'MUTE',
  KICK = 'KICK',
  NOTIFY_ADMINS = 'NOTIFY_ADMINS',
  REVIEW = 'REVIEW',
}

export enum RuleType {
  WORD = 'WORD',
  REGEX = 'REGEX',
  LINK_DOMAIN = 'LINK_DOMAIN',
  SPAM_PATTERN = 'SPAM_PATTERN',
  CAPS = 'CAPS',
  FLOOD = 'FLOOD',
  MENTION_SPAM = 'MENTION_SPAM',
  MEDIA = 'MEDIA',
  FORWARD = 'FORWARD',
  CUSTOM_AI = 'CUSTOM_AI',
}

export enum LinkMode {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  REVIEW = 'REVIEW',
}

export enum LinkList {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
}

export enum AdminRoleName {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}

export type PolicyMode = 'off' | 'review' | 'delete' | 'warn';

export const SEVERITY_RANK: Record<Severity, number> = {
  [Severity.LOW]: 1,
  [Severity.MEDIUM]: 2,
  [Severity.HIGH]: 3,
  [Severity.CRITICAL]: 4,
};
