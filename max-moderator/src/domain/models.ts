import type {
  AdminRoleName,
  LinkList,
  LinkMode,
  ModerationAction,
  RuleType,
  Severity,
} from './enums.js';

export interface ChatSettings {
  chatId: string;
  linkMode: LinkMode;
  defaultAction: ModerationAction;
  language: string;
  enabled: boolean;
  wholeWord: boolean;
  purgeEnabled: boolean;
  hardAction: ModerationAction;
  capsRatio: number;
  capsMinLength: number;
  floodLimit: number;
  floodWindowMs: number;
  repeatLimit: number;
  mentionLimit: number;
  moderateCaps: boolean;
  moderateFlood: boolean;
  moderateMentions: boolean;
  moderateMedia: boolean;
  moderateForwards: boolean;
  lexiconSeeded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WordFilter {
  id: number;
  chatId: string;
  type: RuleType;
  pattern: string;
  action: ModerationAction;
  severity: Severity;
  enabled: boolean;
  wholeWord: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkRule {
  id: number;
  chatId: string;
  domain: string;
  list: LinkList;
  action: ModerationAction;
  note: string | null;
  createdAt: Date;
}

export interface WhitelistEntry {
  chatId: string;
  userId: string;
  reason: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface Violation {
  id: number;
  chatId: string;
  userId: string;
  messageId: string;
  ruleId: number | null;
  violationType: RuleType;
  severity: Severity;
  action: ModerationAction;
  reason: string;
  createdAt: Date;
}

export interface AuditLog {
  id: number;
  chatId: string;
  actorId: string;
  targetUserId: string | null;
  action: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AdminRole {
  chatId: string;
  userId: string;
  role: AdminRoleName;
  createdAt: Date;
}

export interface NewWordFilter {
  chatId: string;
  type: RuleType;
  pattern: string;
  action: ModerationAction;
  severity: Severity;
  enabled?: boolean;
  wholeWord: boolean;
  createdBy: string;
}

export interface NewViolation {
  chatId: string;
  userId: string;
  messageId: string;
  ruleId: number | null;
  violationType: RuleType;
  severity: Severity;
  action: ModerationAction;
  reason: string;
}

export interface NewAuditLog {
  chatId: string;
  actorId: string;
  targetUserId: string | null;
  action: string;
  reason: string;
  metadata?: Record<string, unknown>;
}
