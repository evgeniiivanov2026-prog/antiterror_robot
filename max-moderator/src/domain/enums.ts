export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
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

export enum ModerationAction {
  DELETE = 'DELETE',
  WARN = 'WARN',
  MUTE = 'MUTE',
  KICK = 'KICK',
  NOTIFY_ADMINS = 'NOTIFY_ADMINS',
  REVIEW = 'REVIEW',
}

export enum Decision {
  ALLOW = 'ALLOW',
  DELETE = 'DELETE',
  WARN = 'WARN',
  MUTE = 'MUTE',
  KICK = 'KICK',
  REVIEW = 'REVIEW',
  NOTIFY_ADMINS = 'NOTIFY_ADMINS',
}

export enum LinkMode {
  ALLOW = 'allow',
  DENY = 'deny',
  REVIEW = 'review',
}

export enum LinkList {
  WHITELIST = 'whitelist',
  BLACKLIST = 'blacklist',
}

export enum AdminRoleName {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}
