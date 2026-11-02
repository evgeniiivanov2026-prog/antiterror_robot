import { Prisma, PrismaClient } from '@prisma/client';
import type { AppEnv } from '../../config/env.js';
import { defaultChatSettings } from '../defaults.js';
import type {
  AdminRoleName,
  AuditLog,
  ChatSettings,
  HardAction,
  LinkList,
  LinkRule,
  ModerationAction,
  Violation,
  WhitelistEntry,
  WordFilter,
} from '../../moderation/types.js';
import { FilterType } from '../../moderation/types.js';
import type { Severity } from '../../moderation/severity.js';
import type { Repositories } from './types.js';

function asHardAction(value: string): HardAction {
  if (value === 'mute' || value === 'kick' || value === 'none') return value;
  return 'none';
}

function mapSettings(row: {
  chatId: string;
  linkMode: string;
  defaultAction: string;
  language: string;
  enabled: boolean;
  wholeWord: boolean;
  purgeEnabled: boolean;
  spamEnabled: boolean;
  capsEnabled: boolean;
  hardAction: string;
  capsRatio: number;
  capsMinLength: number;
  floodMax: number;
  floodWindowSec: number;
  mentionMax: number;
  duplicateThreshold: number;
  muteSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}): ChatSettings {
  return {
    chatId: row.chatId,
    linkMode: row.linkMode as ChatSettings['linkMode'],
    defaultAction: row.defaultAction as ModerationAction,
    language: row.language,
    enabled: row.enabled,
    wholeWord: row.wholeWord,
    purgeEnabled: row.purgeEnabled,
    spamEnabled: row.spamEnabled,
    capsEnabled: row.capsEnabled,
    hardAction: asHardAction(row.hardAction),
    capsRatio: row.capsRatio,
    capsMinLength: row.capsMinLength,
    floodMax: row.floodMax,
    floodWindowSec: row.floodWindowSec,
    mentionMax: row.mentionMax,
    duplicateThreshold: row.duplicateThreshold,
    muteSeconds: row.muteSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
  wholeWord: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): WordFilter {
  return {
    id: row.id,
    chatId: row.chatId,
    type: row.type as FilterType,
    pattern: row.pattern,
    action: row.action as ModerationAction,
    severity: row.severity as Severity,
    enabled: row.enabled,
    wholeWord: row.wholeWord,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPrismaRepositories(
  prisma: PrismaClient,
  defaults: Pick<AppEnv, 'defaultLinkMode' | 'defaultWordAction'>,
): Repositories {
  return {
    settings: {
      async getOrCreate(chatId) {
        const existing = await prisma.chatSettings.findUnique({ where: { chatId } });
        if (existing) return mapSettings(existing);
        const created = defaultChatSettings(chatId, defaults);
        const row = await prisma.chatSettings.create({
          data: {
            chatId,
            linkMode: created.linkMode,
            defaultAction: created.defaultAction,
            language: created.language,
            enabled: created.enabled,
            wholeWord: created.wholeWord,
            purgeEnabled: created.purgeEnabled,
            spamEnabled: created.spamEnabled,
            capsEnabled: created.capsEnabled,
            hardAction: created.hardAction,
            capsRatio: created.capsRatio,
            capsMinLength: created.capsMinLength,
            floodMax: created.floodMax,
            floodWindowSec: created.floodWindowSec,
            mentionMax: created.mentionMax,
            duplicateThreshold: created.duplicateThreshold,
            muteSeconds: created.muteSeconds,
          },
        });
        return mapSettings(row);
      },
      async update(chatId, patch) {
        await this.getOrCreate(chatId);
        const row = await prisma.chatSettings.update({
          where: { chatId },
          data: {
            ...(patch.linkMode !== undefined ? { linkMode: patch.linkMode } : {}),
            ...(patch.defaultAction !== undefined ? { defaultAction: patch.defaultAction } : {}),
            ...(patch.language !== undefined ? { language: patch.language } : {}),
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(patch.wholeWord !== undefined ? { wholeWord: patch.wholeWord } : {}),
            ...(patch.purgeEnabled !== undefined ? { purgeEnabled: patch.purgeEnabled } : {}),
            ...(patch.spamEnabled !== undefined ? { spamEnabled: patch.spamEnabled } : {}),
            ...(patch.capsEnabled !== undefined ? { capsEnabled: patch.capsEnabled } : {}),
            ...(patch.hardAction !== undefined ? { hardAction: patch.hardAction } : {}),
            ...(patch.capsRatio !== undefined ? { capsRatio: patch.capsRatio } : {}),
            ...(patch.capsMinLength !== undefined ? { capsMinLength: patch.capsMinLength } : {}),
            ...(patch.floodMax !== undefined ? { floodMax: patch.floodMax } : {}),
            ...(patch.floodWindowSec !== undefined ? { floodWindowSec: patch.floodWindowSec } : {}),
            ...(patch.mentionMax !== undefined ? { mentionMax: patch.mentionMax } : {}),
            ...(patch.duplicateThreshold !== undefined
              ? { duplicateThreshold: patch.duplicateThreshold }
              : {}),
            ...(patch.muteSeconds !== undefined ? { muteSeconds: patch.muteSeconds } : {}),
          },
        });
        return mapSettings(row);
      },
    },
    filters: {
      async list(chatId, enabledOnly = false) {
        const rows = await prisma.wordFilter.findMany({
          where: { chatId, ...(enabledOnly ? { enabled: true } : {}) },
          orderBy: { id: 'asc' },
        });
        return rows.map((row) => mapFilter(row));
      },
      async create(input) {
        const row = await prisma.wordFilter.create({
          data: {
            chatId: input.chatId,
            type: input.type,
            pattern: input.pattern,
            action: input.action,
            severity: input.severity,
            enabled: input.enabled ?? true,
            wholeWord: input.wholeWord ?? true,
            createdBy: input.createdBy,
          },
        });
        return mapFilter(row);
      },
      async find(chatId, id) {
        const row = await prisma.wordFilter.findFirst({ where: { chatId, id } });
        return row ? mapFilter(row) : null;
      },
      async remove(chatId, id) {
        const result = await prisma.wordFilter.deleteMany({ where: { chatId, id } });
        return result.count > 0;
      },
      async setEnabled(chatId, id, enabled) {
        const result = await prisma.wordFilter.updateMany({
          where: { chatId, id },
          data: { enabled },
        });
        if (result.count === 0) return null;
        return this.find(chatId, id);
      },
      async setAction(chatId, id, action) {
        const result = await prisma.wordFilter.updateMany({
          where: { chatId, id },
          data: { action },
        });
        if (result.count === 0) return null;
        return this.find(chatId, id);
      },
      async setSeverity(chatId, id, severity) {
        const result = await prisma.wordFilter.updateMany({
          where: { chatId, id },
          data: { severity },
        });
        if (result.count === 0) return null;
        return this.find(chatId, id);
      },
      async clear(chatId) {
        const result = await prisma.wordFilter.deleteMany({ where: { chatId } });
        return result.count;
      },
    },
    links: {
      async list(chatId) {
        const rows = await prisma.linkRule.findMany({ where: { chatId }, orderBy: { id: 'asc' } });
        return rows.map((row) => mapLink(row));
      },
      async upsert(input) {
        const row = await prisma.linkRule.upsert({
          where: { chatId_domain: { chatId: input.chatId, domain: input.domain } },
          create: {
            chatId: input.chatId,
            domain: input.domain,
            list: input.list,
            action: input.action,
            note: input.note ?? null,
          },
          update: {
            list: input.list,
            action: input.action,
            note: input.note ?? null,
          },
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
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((row) => row as WhitelistEntry);
      },
      async has(chatId, userId) {
        const row = await prisma.userWhitelist.findUnique({
          where: { chatId_userId: { chatId, userId } },
        });
        return row !== null;
      },
      async add(chatId, userId, createdBy, reason) {
        const row = await prisma.userWhitelist.upsert({
          where: { chatId_userId: { chatId, userId } },
          create: { chatId, userId, createdBy, reason: reason ?? null },
          update: { createdBy, reason: reason ?? null },
        });
        return row;
      },
      async remove(chatId, userId) {
        const result = await prisma.userWhitelist.deleteMany({ where: { chatId, userId } });
        return result.count > 0;
      },
    },
    violations: {
      async insertIfAbsent(input) {
        try {
          const row = await prisma.violation.create({ data: input });
          return { created: true, row: row as Violation };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const existing = await prisma.violation.findUnique({
              where: { chatId_messageId: { chatId: input.chatId, messageId: input.messageId } },
            });
            if (!existing) throw error;
            return { created: false, row: existing as Violation };
          }
          throw error;
        }
      },
      async exists(chatId, messageId) {
        const row = await prisma.violation.findUnique({
          where: { chatId_messageId: { chatId, messageId } },
          select: { id: true },
        });
        return row !== null;
      },
      async listByUser(chatId, userId, limit) {
        const rows = await prisma.violation.findMany({
          where: { chatId, userId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return rows as Violation[];
      },
      async countByUser(chatId, userId) {
        return prisma.violation.count({ where: { chatId, userId } });
      },
    },
    audit: {
      async write(entry) {
        const row = await prisma.auditLog.create({
          data: {
            chatId: entry.chatId,
            actorId: entry.actorId,
            targetUserId: entry.targetUserId,
            action: entry.action,
            reason: entry.reason,
            metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        return {
          id: Number(row.id),
          chatId: row.chatId,
          actorId: row.actorId,
          targetUserId: row.targetUserId,
          action: row.action,
          reason: row.reason,
          metadata: asMetadata(row.metadata),
          createdAt: row.createdAt,
        } satisfies AuditLog;
      },
      async listRecent(chatId, limit) {
        const rows = await prisma.auditLog.findMany({
          where: { chatId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return rows.map((row) => ({
          id: Number(row.id),
          chatId: row.chatId,
          actorId: row.actorId,
          targetUserId: row.targetUserId,
          action: row.action,
          reason: row.reason,
          metadata: asMetadata(row.metadata),
          createdAt: row.createdAt,
        }));
      },
    },
    roles: {
      async getRole(chatId, userId) {
        const row = await prisma.adminRole.findUnique({
          where: { chatId_userId: { chatId, userId } },
        });
        return (row?.role as AdminRoleName | undefined) ?? null;
      },
      async upsert(chatId, userId, role) {
        return prisma.adminRole.upsert({
          where: { chatId_userId: { chatId, userId } },
          create: { chatId, userId, role },
          update: { role },
        });
      },
    },
    events: {
      async claim(chatId, messageId, eventKey) {
        try {
          await prisma.processedEvent.create({ data: { chatId, messageId, eventKey } });
          return true;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            return false;
          throw error;
        }
      },
      async deleteOlderThan(before) {
        const result = await prisma.processedEvent.deleteMany({
          where: { createdAt: { lt: before } },
        });
        return result.count;
      },
    },
  };
}

function mapLink(row: {
  id: number;
  chatId: string;
  domain: string;
  list: string;
  action: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LinkRule {
  return {
    id: row.id,
    chatId: row.chatId,
    domain: row.domain,
    list: row.list as LinkList,
    action: row.action as ModerationAction,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function asMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}
