import { Prisma, PrismaClient } from '@prisma/client';
import type { PolicyMode } from '../../domain/enums.js';
import {
  AdminRoleName,
  LinkList,
  LinkMode,
  ModerationAction,
  RuleType,
  Severity,
} from '../../domain/enums.js';
import type {
  AdminRoleRecord,
  AuditRecord,
  ChatSettingsRecord,
  LinkRuleRecord,
  ViolationRecord,
  WhitelistRecord,
  WordFilterRecord,
} from '../../domain/types.js';
import type { Repositories, ViolationInsert } from './types.js';

const POLICY_MODES = new Set<PolicyMode>(['off', 'review', 'delete', 'warn']);

function asPolicy(value: string): PolicyMode {
  return POLICY_MODES.has(value as PolicyMode) ? (value as PolicyMode) : 'off';
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export function createPrismaRepositories(prisma: PrismaClient): Repositories {
  return {
    settings: {
      async get(chatId) {
        const row = await prisma.chatSettings.findUnique({ where: { chatId } });
        return row ? mapSettings(row) : null;
      },
      async create(settings) {
        try {
          const row = await prisma.chatSettings.create({ data: settingsData(settings) });
          return mapSettings(row);
        } catch (error) {
          if (!isUnique(error)) throw error;
          const row = await prisma.chatSettings.findUnique({ where: { chatId: settings.chatId } });
          if (!row) throw error;
          return mapSettings(row);
        }
      },
      async save(settings) {
        const row = await prisma.chatSettings.upsert({
          where: { chatId: settings.chatId },
          create: settingsData(settings),
          update: settingsData(settings),
        });
        return mapSettings(row);
      },
    },
    filters: {
      async list(chatId, enabledOnly) {
        const rows = await prisma.wordFilter.findMany({
          where: { chatId, ...(enabledOnly ? { enabled: true } : {}) },
          orderBy: { id: 'asc' },
        });
        return rows.map(mapFilter);
      },
      async getById(chatId, id) {
        const row = await prisma.wordFilter.findFirst({ where: { id, chatId } });
        return row ? mapFilter(row) : null;
      },
      async create(input) {
        const row = await prisma.wordFilter.create({ data: input });
        return mapFilter(row);
      },
      async update(chatId, id, patch) {
        const existing = await prisma.wordFilter.findFirst({ where: { id, chatId } });
        if (!existing) return null;
        const row = await prisma.wordFilter.update({ where: { id }, data: patch });
        return mapFilter(row);
      },
      async remove(chatId, id) {
        const result = await prisma.wordFilter.deleteMany({ where: { id, chatId } });
        return result.count > 0;
      },
      async clear(chatId) {
        const result = await prisma.wordFilter.deleteMany({ where: { chatId } });
        return result.count;
      },
    },
    links: {
      async list(chatId) {
        const rows = await prisma.linkRule.findMany({
          where: { chatId },
          orderBy: { domain: 'asc' },
        });
        return rows.map(mapLink);
      },
      async upsert(input) {
        const row = await prisma.linkRule.upsert({
          where: { chatId_domain: { chatId: input.chatId, domain: input.domain } },
          create: input,
          update: { list: input.list, action: input.action, note: input.note },
        });
        return mapLink(row);
      },
      async remove(chatId, domain) {
        const result = await prisma.linkRule.deleteMany({ where: { chatId, domain } });
        return result.count > 0;
      },
    },
    whitelist: {
      async list(chatId) {
        const rows = await prisma.userWhitelist.findMany({
          where: { chatId },
          orderBy: { userId: 'asc' },
        });
        return rows.map((row) => ({
          chatId: row.chatId,
          userId: row.userId,
          reason: row.reason,
          createdBy: row.createdBy,
        }));
      },
      async has(chatId, userId) {
        const row = await prisma.userWhitelist.findUnique({
          where: { chatId_userId: { chatId, userId } },
        });
        return row !== null;
      },
      async add(input: WhitelistRecord) {
        await prisma.userWhitelist.upsert({
          where: { chatId_userId: { chatId: input.chatId, userId: input.userId } },
          create: input,
          update: { reason: input.reason, createdBy: input.createdBy },
        });
      },
      async remove(chatId, userId) {
        const result = await prisma.userWhitelist.deleteMany({ where: { chatId, userId } });
        return result.count > 0;
      },
    },
    violations: {
      async insert(input: ViolationInsert) {
        try {
          await prisma.violation.create({ data: input });
          return 'created';
        } catch (error) {
          if (isUnique(error)) return 'duplicate';
          throw error;
        }
      },
      async countSince(chatId, userId, types, sinceMs) {
        return prisma.violation.count({
          where: {
            chatId,
            userId,
            violationType: { in: types },
            createdAt: { gte: new Date(sinceMs) },
          },
        });
      },
      async listByUser(chatId, userId, limit) {
        const rows = await prisma.violation.findMany({
          where: { chatId, userId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return rows.map(mapViolation);
      },
    },
    audit: {
      async append(input) {
        const row = await prisma.auditLog.create({
          data: {
            chatId: input.chatId,
            actorId: input.actorId,
            targetUserId: input.targetUserId,
            action: input.action,
            reason: input.reason.slice(0, 500),
            metadata: toJson(input.metadata),
            createdAt: input.createdAt,
          },
        });
        return mapAudit(row);
      },
      async listRecent(chatId, limit) {
        const rows = await prisma.auditLog.findMany({
          where: { chatId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return rows.map(mapAudit);
      },
    },
    admins: {
      async get(chatId, userId) {
        const row = await prisma.adminRole.findUnique({
          where: { chatId_userId: { chatId, userId } },
        });
        return row
          ? {
              chatId: row.chatId,
              userId: row.userId,
              role: row.role as AdminRoleName,
              createdBy: row.createdBy,
            }
          : null;
      },
      async upsert(input: AdminRoleRecord) {
        await prisma.adminRole.upsert({
          where: { chatId_userId: { chatId: input.chatId, userId: input.userId } },
          create: input,
          update: { role: input.role, createdBy: input.createdBy },
        });
      },
      async remove(chatId, userId) {
        const result = await prisma.adminRole.deleteMany({ where: { chatId, userId } });
        return result.count > 0;
      },
    },
    processed: {
      async tryInsert(chatId, messageId, contentHash) {
        try {
          await prisma.processedEvent.create({ data: { chatId, messageId, contentHash } });
          return true;
        } catch (error) {
          if (isUnique(error)) return false;
          throw error;
        }
      },
    },
    restrictions: {
      async mute(chatId, userId, untilMs, reason) {
        await prisma.userRestriction.create({
          data: {
            chatId,
            userId,
            kind: 'MUTE',
            until: new Date(untilMs),
            reason: reason.slice(0, 200),
          },
        });
      },
      async activeMute(chatId, userId, nowMs) {
        const row = await prisma.userRestriction.findFirst({
          where: { chatId, userId, kind: 'MUTE', until: { gt: new Date(nowMs) } },
        });
        return row !== null;
      },
    },
  };
}

function settingsData(settings: ChatSettingsRecord) {
  return {
    chatId: settings.chatId,
    linkMode: settings.linkMode,
    defaultAction: settings.defaultAction,
    language: settings.language,
    enabled: settings.enabled,
    wholeWord: settings.wholeWord,
    capsEnabled: settings.capsEnabled,
    capsRatio: settings.capsRatio,
    capsMinLength: settings.capsMinLength,
    floodEnabled: settings.floodEnabled,
    floodMaxMessages: settings.floodMaxMessages,
    floodWindowSec: settings.floodWindowSec,
    mentionEnabled: settings.mentionEnabled,
    mentionMax: settings.mentionMax,
    repeatEnabled: settings.repeatEnabled,
    repeatMax: settings.repeatMax,
    repeatWindowSec: settings.repeatWindowSec,
    mediaMode: settings.mediaMode,
    forwardMode: settings.forwardMode,
    hardAction: settings.hardAction,
    muteMinutes: settings.muteMinutes,
    allowPurge: settings.allowPurge,
  };
}

type SettingsRow = {
  chatId: string;
  linkMode: string;
  defaultAction: string;
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
  mediaMode: string;
  forwardMode: string;
  hardAction: string;
  muteMinutes: number;
  allowPurge: boolean;
};

function mapSettings(row: SettingsRow): ChatSettingsRecord {
  return {
    chatId: row.chatId,
    linkMode: row.linkMode as LinkMode,
    defaultAction: row.defaultAction as ModerationAction,
    language: row.language,
    enabled: row.enabled,
    wholeWord: row.wholeWord,
    capsEnabled: row.capsEnabled,
    capsRatio: row.capsRatio,
    capsMinLength: row.capsMinLength,
    floodEnabled: row.floodEnabled,
    floodMaxMessages: row.floodMaxMessages,
    floodWindowSec: row.floodWindowSec,
    mentionEnabled: row.mentionEnabled,
    mentionMax: row.mentionMax,
    repeatEnabled: row.repeatEnabled,
    repeatMax: row.repeatMax,
    repeatWindowSec: row.repeatWindowSec,
    mediaMode: asPolicy(row.mediaMode),
    forwardMode: asPolicy(row.forwardMode),
    hardAction: row.hardAction as ModerationAction,
    muteMinutes: row.muteMinutes,
    allowPurge: row.allowPurge,
  };
}

function mapFilter(row: {
  id: number;
  chatId: string;
  type: string;
  pattern: string;
  action: string;
  severity: string;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): WordFilterRecord {
  return {
    id: row.id,
    chatId: row.chatId,
    type: row.type as RuleType,
    pattern: row.pattern,
    action: row.action as ModerationAction,
    severity: row.severity as Severity,
    enabled: row.enabled,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLink(row: {
  id: number;
  chatId: string;
  domain: string;
  list: string;
  action: string;
  note: string;
}): LinkRuleRecord {
  return {
    id: row.id,
    chatId: row.chatId,
    domain: row.domain,
    list: row.list as LinkList,
    action: row.action as ModerationAction,
    note: row.note,
  };
}

function mapViolation(row: {
  id: number;
  chatId: string;
  userId: string;
  messageId: string;
  contentHash: string;
  ruleId: number | null;
  violationType: string;
  severity: string;
  action: string;
  reason: string;
  createdAt: Date;
}): ViolationRecord {
  return {
    id: row.id,
    chatId: row.chatId,
    userId: row.userId,
    messageId: row.messageId,
    contentHash: row.contentHash,
    ruleId: row.ruleId,
    violationType: row.violationType as RuleType,
    severity: row.severity as Severity,
    action: row.action as ModerationAction,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

function mapAudit(row: {
  id: number;
  chatId: string;
  actorId: string;
  targetUserId: string | null;
  action: string;
  reason: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): AuditRecord {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    chatId: row.chatId,
    actorId: row.actorId,
    targetUserId: row.targetUserId,
    action: row.action,
    reason: row.reason,
    metadata,
    createdAt: row.createdAt,
  };
}
