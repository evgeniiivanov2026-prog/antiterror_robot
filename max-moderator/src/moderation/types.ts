import type { Severity } from './severity.js';

export enum FilterType {
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

export type Decision = 'ALLOW' | 'DELETE' | 'WARN' | 'MUTE' | 'KICK' | 'REVIEW' | 'NOTIFY_ADMINS';

export type LinkMode = 'allow' | 'deny' | 'review';

export type LinkList = 'whitelist' | 'blacklist';

export type HardAction = 'none' | 'mute' | 'kick';

export interface ChatSettings {
  chatId: string;
  linkMode: LinkMode;
  defaultAction: ModerationAction;
  language: string;
  enabled: boolean;
  wholeWord: boolean;
  purgeEnabled: boolean;
  spamEnabled: boolean;
  capsEnabled: boolean;
  hardAction: HardAction;
  capsRatio: number;
  capsMinLength: number;
  floodMax: number;
  floodWindowSec: number;
  mentionMax: number;
  duplicateThreshold: number;
  muteSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WordFilter {
  id: number;
  chatId: string;
  type: FilterType;
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
  updatedAt: Date;
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
  violationType: string;
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

export type AdminRoleName = 'ADMIN' | 'OWNER';

export interface AdminRole {
  chatId: string;
  userId: string;
  role: AdminRoleName;
  createdAt: Date;
}

export interface FilterHit {
  type: string;
  ruleId?: number;
  action: ModerationAction;
  severity: Severity;
  reason: string;
}

export interface ModerationPlan {
  decision: Exclude<Decision, 'ALLOW'>;
  severity: Severity;
  reason: string;
  ruleId?: number;
  violationType: string;
  deleteMessage: boolean;
  warnUser: boolean;
  notifyAdmins: boolean;
  mute: boolean;
  kick: boolean;
}

export interface NewWordFilter {
  chatId: string;
  type: FilterType;
  pattern: string;
  action: ModerationAction;
  severity: Severity;
  enabled?: boolean;
  wholeWord?: boolean;
  createdBy: string;
}

export interface NewLinkRule {
  chatId: string;
  domain: string;
  list: LinkList;
  action: ModerationAction;
  note?: string | null;
}

export interface NewViolation {
  chatId: string;
  userId: string;
  messageId: string;
  ruleId: number | null;
  violationType: string;
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

export function parseAction(value: string): ModerationAction | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  const map: Record<string, ModerationAction> = {
    delete: ModerationAction.DELETE,
    warn: ModerationAction.WARN,
    mute: ModerationAction.MUTE,
    kick: ModerationAction.KICK,
    notify: ModerationAction.NOTIFY_ADMINS,
    notify_admins: ModerationAction.NOTIFY_ADMINS,
    review: ModerationAction.REVIEW,
  };
  return map[normalized] ?? null;
}

export function parseLinkMode(value: string): LinkMode | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'allow' || normalized === 'deny' || normalized === 'review') return normalized;
  return null;
}

export function parseHardAction(value: string): HardAction | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'none' || normalized === 'mute' || normalized === 'kick') return normalized;
  return null;
}
