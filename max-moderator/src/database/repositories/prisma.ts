import { Prisma, PrismaClient } from '@prisma/client';
import {
  AdminRoleName,
  LinkList,
  LinkMode,
  ModerationAction,
  RuleType,
  Severity,
} from '../../domain/enums.js';
import type {
  AdminRole,
  AuditLog,
  ChatSettings,
  LinkRule,
  NewAuditLog,
  NewViolation,
  NewWordFilter,
  Violation,
  WhitelistEntry,
  WordFilter,
} from '../../domain/models.js';
import type {
  AdminRoleRepository,
  AuditRepository,
  FilterRepository,
  LinkRuleRepository,
  Repositories,
  SettingsRepository,
  ViolationRepository,
  WhitelistRepository,
} from './types.js';

function asAction(value: string): ModerationAction {
  if (Object.values(ModerationAction).includes(value as ModerationAction))
    return value as ModerationAction;
  return ModerationAction.DELETE;
}

function asSeverity(value: string): Severity {
  if (Object.values(Severity).includes(value as Severity)) return value as Severity;
  return Severity.MEDIUM;
}

function asRuleType(value: string): RuleType {
  if (Object.values(RuleType).includes(value as RuleType)) return value as RuleType;
  return RuleType.WORD;
}

function asLinkMode(value: string): LinkMode {
  if (value === LinkMode.ALLOW || value === LinkMode.DENY || value === LinkMode.REVIEW)
    return value;
  return LinkMode.REVIEW;
}

function asMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  async get(chatId: string): Promise<ChatSettings | null> {
    const row = await this.db.chatSettings.findUnique({ where: { chatId } });
    return row ? this.map(row) : null;
  }

  async ensure(settings: ChatSettings): Promise<ChatSettings> {
    const row = await this.db.chatSettings.upsert({
      where: { chatId: settings.chatId },
      update: {},
      create: this.toRow(settings),
    });
    return this.map(row);
  }

  async save(settings: ChatSettings): Promise<ChatSettings> {
    const row = await this.db.chatSettings.update({
      where: { chatId: settings.chatId },
      data: this.toRow(settings),
    });
    return this.map(row);
  }

  private toRow(settings: ChatSettings) {
    return {
      chatId: settings.chatId,
      linkMode: settings.linkMode,
      defaultAction: settings.defaultAction,
      language: settings.language,
      enabled: settings.enabled,
      wholeWord: settings.wholeWord,
      purgeEnabled: settings.purgeEnabled,
      hardAction: settings.hardAction,
      capsRatio: settings.capsRatio,
      capsMinLength: settings.capsMinLength,
      floodLimit: settings.floodLimit,
      floodWindowMs: settings.floodWindowMs,
      repeatLimit: settings.repeatLimit,
      mentionLimit: settings.mentionLimit,
      moderateCaps: settings.moderateCaps,
      moderateFlood: settings.moderateFlood,
      moderateMentions: settings.moderateMentions,
      moderateMedia: settings.moderateMedia,
      moderateForwards: settings.moderateForwards,
      lexiconSeeded: settings.lexiconSeeded,
    };
  }

  private map(row: {
    chatId: string;
    linkMode: string;
    defaultAction: string;
    language: string;
    enabled: boolean;
    wholeWord: boolean;
    purgeEnabled: boolean;
    hardAction: string;
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
  }): ChatSettings {
    return {
      ...row,
      linkMode: asLinkMode(row.linkMode),
      defaultAction: asAction(row.defaultAction),
      hardAction: asAction(row.hardAction),
    };
  }
}

export class PrismaFilterRepository implements FilterRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(chatId: string, enabledOnly = false): Promise<WordFilter[]> {
    const rows = await this.db.wordFilter.findMany({
      where: { chatId, ...(enabledOnly ? { enabled: true } : {}) },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.map(row));
  }

  async findById(chatId: string, id: number): Promise<WordFilter | null> {
    const row = await this.db.wordFilter.findFirst({ where: { id, chatId } });
    return row ? this.map(row) : null;
  }

  async create(input: NewWordFilter): Promise<WordFilter> {
    const row = await this.db.wordFilter.create({
      data: {
        chatId: input.chatId,
        type: input.type,
        pattern: input.pattern,
        action: input.action,
        severity: input.severity,
        enabled: input.enabled ?? true,
        wholeWord: input.wholeWord,
        createdBy: input.createdBy,
      },
    });
    return this.map(row);
  }

  async save(filter: WordFilter): Promise<WordFilter> {
    const row = await this.db.wordFilter.update({
      where: { id: filter.id },
      data: {
        pattern: filter.pattern,
        action: filter.action,
        severity: filter.severity,
        enabled: filter.enabled,
        wholeWord: filter.wholeWord,
        type: filter.type,
      },
    });
    return this.map(row);
  }

  async delete(chatId: string, id: number): Promise<boolean> {
    const result = await this.db.wordFilter.deleteMany({ where: { id, chatId } });
    return result.count > 0;
  }

  async deleteAll(chatId: string): Promise<number> {
    const result = await this.db.wordFilter.deleteMany({ where: { chatId } });
    return result.count;
  }

  private map(row: {
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
      ...row,
      type: asRuleType(row.type),
      action: asAction(row.action),
      severity: asSeverity(row.severity),
    };
  }
}

export class PrismaLinkRuleRepository implements LinkRuleRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(chatId: string): Promise<LinkRule[]> {
    const rows = await this.db.linkRule.findMany({ where: { chatId }, orderBy: { domain: 'asc' } });
    return rows.map((row) => this.map(row));
  }

  async upsert(input: {
    chatId: string;
    domain: string;
    list: LinkList;
    action: ModerationAction;
    note?: string | null;
  }): Promise<LinkRule> {
    const row = await this.db.linkRule.upsert({
      where: { chatId_domain: { chatId: input.chatId, domain: input.domain } },
      update: { list: input.list, action: input.action, note: input.note ?? null },
      create: {
        chatId: input.chatId,
        domain: input.domain,
        list: input.list,
        action: input.action,
        note: input.note ?? null,
      },
    });
    return this.map(row);
  }

  async delete(chatId: string, domain: string): Promise<boolean> {
    const result = await this.db.linkRule.deleteMany({ where: { chatId, domain } });
    return result.count > 0;
  }

  private map(row: {
    id: number;
    chatId: string;
    domain: string;
    list: string;
    action: string;
    note: string | null;
    createdAt: Date;
  }): LinkRule {
    return {
      ...row,
      list: row.list === LinkList.WHITELIST ? LinkList.WHITELIST : LinkList.BLACKLIST,
      action: asAction(row.action),
    };
  }
}

export class PrismaWhitelistRepository implements WhitelistRepository {
  constructor(private readonly db: PrismaClient) {}

  async has(chatId: string, userId: string): Promise<boolean> {
    const row = await this.db.userWhitelist.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    return row !== null;
  }

  async add(
    entry: Omit<WhitelistEntry, 'createdAt'> & { createdAt?: Date },
  ): Promise<WhitelistEntry> {
    const row = await this.db.userWhitelist.upsert({
      where: { chatId_userId: { chatId: entry.chatId, userId: entry.userId } },
      update: { reason: entry.reason, createdBy: entry.createdBy },
      create: {
        chatId: entry.chatId,
        userId: entry.userId,
        reason: entry.reason,
        createdBy: entry.createdBy,
      },
    });
    return row;
  }

  async remove(chatId: string, userId: string): Promise<boolean> {
    const result = await this.db.userWhitelist.deleteMany({ where: { chatId, userId } });
    return result.count > 0;
  }
}

export class PrismaViolationRepository implements ViolationRepository {
  constructor(private readonly db: PrismaClient) {}

  async insertIfNew(input: NewViolation): Promise<Violation | null> {
    try {
      const row = await this.db.violation.create({
        data: {
          chatId: input.chatId,
          userId: input.userId,
          messageId: input.messageId,
          ruleId: input.ruleId,
          violationType: input.violationType,
          severity: input.severity,
          action: input.action,
          reason: input.reason,
        },
      });
      return this.map(row);
    } catch (error) {
      if (isUniqueConflict(error)) return null;
      throw error;
    }
  }

  async listByUser(chatId: string, userId: string, limit: number): Promise<Violation[]> {
    const rows = await this.db.violation.findMany({
      where: { chatId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.map(row));
  }

  async countByUser(chatId: string, userId: string): Promise<number> {
    return this.db.violation.count({ where: { chatId, userId } });
  }

  private map(row: {
    id: number;
    chatId: string;
    userId: string;
    messageId: string;
    ruleId: number | null;
    violationType: string;
    severity: string;
    action: string;
    reason: string;
    createdAt: Date;
  }): Violation {
    return {
      ...row,
      violationType: asRuleType(row.violationType),
      severity: asSeverity(row.severity),
      action: asAction(row.action),
    };
  }
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly db: PrismaClient) {}

  async insert(input: NewAuditLog): Promise<AuditLog> {
    const row = await this.db.auditLog.create({
      data: {
        chatId: input.chatId,
        actorId: input.actorId,
        targetUserId: input.targetUserId,
        action: input.action,
        reason: input.reason,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return {
      id: row.id,
      chatId: row.chatId,
      actorId: row.actorId,
      targetUserId: row.targetUserId,
      action: row.action,
      reason: row.reason,
      metadata: asMetadata(row.metadata),
      createdAt: row.createdAt,
    };
  }

  async listRecent(chatId: string, limit: number): Promise<AuditLog[]> {
    const rows = await this.db.auditLog.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      chatId: row.chatId,
      actorId: row.actorId,
      targetUserId: row.targetUserId,
      action: row.action,
      reason: row.reason,
      metadata: asMetadata(row.metadata),
      createdAt: row.createdAt,
    }));
  }
}

export class PrismaAdminRoleRepository implements AdminRoleRepository {
  constructor(private readonly db: PrismaClient) {}

  async get(chatId: string, userId: string): Promise<AdminRole | null> {
    const row = await this.db.adminRole.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!row) return null;
    return {
      chatId: row.chatId,
      userId: row.userId,
      role: row.role === AdminRoleName.OWNER ? AdminRoleName.OWNER : AdminRoleName.ADMIN,
      createdAt: row.createdAt,
    };
  }

  async upsert(chatId: string, userId: string, role: AdminRoleName): Promise<AdminRole> {
    const row = await this.db.adminRole.upsert({
      where: { chatId_userId: { chatId, userId } },
      update: { role },
      create: { chatId, userId, role },
    });
    return {
      chatId: row.chatId,
      userId: row.userId,
      role: row.role === AdminRoleName.OWNER ? AdminRoleName.OWNER : AdminRoleName.ADMIN,
      createdAt: row.createdAt,
    };
  }
}

export function createPrismaRepositories(db: PrismaClient): Repositories {
  return {
    settings: new PrismaSettingsRepository(db),
    filters: new PrismaFilterRepository(db),
    links: new PrismaLinkRuleRepository(db),
    whitelist: new PrismaWhitelistRepository(db),
    violations: new PrismaViolationRepository(db),
    audit: new PrismaAuditRepository(db),
    roles: new PrismaAdminRoleRepository(db),
  };
}
