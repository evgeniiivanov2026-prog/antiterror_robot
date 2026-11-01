import type {
  AdminRoleName,
  LinkList,
  LinkMode,
  ModerationAction,
  PolicyMode,
  RuleType,
  Severity,
} from './enums.js';

export interface ChatSettingsRecord {
  chatId: string;
  linkMode: LinkMode;
  defaultAction: ModerationAction;
  language: string;
  enabled: boolean;
  wholeWord: boolean;
  capsEnabled: boolean;
  capsRatio: number;
  capsMinLength: number;
  floodEnabled: boolean;
  floodMaxMessages: number;
  floodWindowSec: number;
  mentionEnabled: boolean;
  mentionMax: number;
  repeatEnabled: boolean;
  repeatMax: number;
  repeatWindowSec: number;
  mediaMode: PolicyMode;
  forwardMode: PolicyMode;
  hardAction: ModerationAction;
  muteMinutes: number;
  allowPurge: boolean;
}

export interface WordFilterRecord {
  id: number;
  chatId: string;
  type: RuleType;
  pattern: string;
  action: ModerationAction;
  severity: Severity;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkRuleRecord {
  id: number;
  chatId: string;
  domain: string;
  list: LinkList;
  action: ModerationAction;
  note: string;
}

export interface WhitelistRecord {
  chatId: string;
  userId: string;
  reason: string;
  createdBy: string;
}

export interface ViolationRecord {
  id: number;
  chatId: string;
  userId: string;
  messageId: string;
  contentHash: string;
  ruleId: number | null;
  violationType: RuleType;
  severity: Severity;
  action: ModerationAction;
  reason: string;
  createdAt: Date;
}

export interface AuditRecord {
  id: number;
  chatId: string;
  actorId: string;
  targetUserId: string | null;
  action: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AdminRoleRecord {
  chatId: string;
  userId: string;
  role: AdminRoleName;
  createdBy: string;
}

export interface IncomingLink {
  raw: string;
  host: string;
  isIp: boolean;
  isShortener: boolean;
  suspicious: boolean;
}

export interface IncomingMessage {
  messageId: string;
  chatId: string;
  chatType: string;
  userId: string;
  isBot: boolean;
  text: string;
  links: IncomingLink[];
  mentionCount: number;
  mediaTypes: string[];
  isForward: boolean;
  timestamp: number;
}

export interface Effects {
  delete: boolean;
  warn: boolean;
  mute: boolean;
  kick: boolean;
  notify: boolean;
  review: boolean;
}

export interface FilterHit {
  type: RuleType;
  action: ModerationAction;
  severity: Severity;
  ruleId: number | null;
  reason: string;
  priority: number;
  effects?: Effects;
}

export interface PlatformAdmin {
  userId: string;
  isOwner: boolean;
  isAdmin: boolean;
  isBot: boolean;
  permissions: string[];
}

export interface RecentMessage {
  messageId: string;
  userId: string | null;
}
