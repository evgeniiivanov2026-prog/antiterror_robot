import { AdminRoleName } from '../../domain/enums.js';
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

export class MemorySettingsRepository implements SettingsRepository {
  private readonly rows = new Map<string, ChatSettings>();

  async get(chatId: string): Promise<ChatSettings | null> {
    const row = this.rows.get(chatId);
    return row ? structuredClone(row) : null;
  }

  async ensure(settings: ChatSettings): Promise<ChatSettings> {
    const existing = this.rows.get(settings.chatId);
    if (existing) return structuredClone(existing);
    this.rows.set(settings.chatId, structuredClone(settings));
    return structuredClone(settings);
  }

  async save(settings: ChatSettings): Promise<ChatSettings> {
    const next = { ...settings, updatedAt: new Date() };
    this.rows.set(settings.chatId, structuredClone(next));
    return structuredClone(next);
  }
}

export class MemoryFilterRepository implements FilterRepository {
  private seq = 1;
  private readonly rows: WordFilter[] = [];

  async list(chatId: string, enabledOnly = false): Promise<WordFilter[]> {
    return this.rows
      .filter((row) => row.chatId === chatId && (!enabledOnly || row.enabled))
      .map((row) => structuredClone(row))
      .sort((a, b) => a.id - b.id);
  }

  async findById(chatId: string, id: number): Promise<WordFilter | null> {
    const row = this.rows.find((item) => item.chatId === chatId && item.id === id);
    return row ? structuredClone(row) : null;
  }

  async create(input: NewWordFilter): Promise<WordFilter> {
    const now = new Date();
    const row: WordFilter = {
      id: this.seq,
      chatId: input.chatId,
      type: input.type,
      pattern: input.pattern,
      action: input.action,
      severity: input.severity,
      enabled: input.enabled ?? true,
      wholeWord: input.wholeWord,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.seq += 1;
    this.rows.push(row);
    return structuredClone(row);
  }

  async save(filter: WordFilter): Promise<WordFilter> {
    const index = this.rows.findIndex(
      (row) => row.id === filter.id && row.chatId === filter.chatId,
    );
    if (index < 0) throw new Error('Фильтр не найден');
    const next = { ...filter, updatedAt: new Date() };
    this.rows[index] = next;
    return structuredClone(next);
  }

  async delete(chatId: string, id: number): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.chatId === chatId && row.id === id);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }

  async deleteAll(chatId: string): Promise<number> {
    const before = this.rows.length;
    const kept = this.rows.filter((row) => row.chatId !== chatId);
    this.rows.length = 0;
    this.rows.push(...kept);
    return before - this.rows.length;
  }
}

export class MemoryLinkRuleRepository implements LinkRuleRepository {
  private seq = 1;
  private readonly rows: LinkRule[] = [];

  async list(chatId: string): Promise<LinkRule[]> {
    return this.rows.filter((row) => row.chatId === chatId).map((row) => structuredClone(row));
  }

  async upsert(input: {
    chatId: string;
    domain: string;
    list: LinkRule['list'];
    action: LinkRule['action'];
    note?: string | null;
  }): Promise<LinkRule> {
    const existing = this.rows.find(
      (row) => row.chatId === input.chatId && row.domain === input.domain,
    );
    if (existing) {
      existing.list = input.list;
      existing.action = input.action;
      existing.note = input.note ?? existing.note;
      return structuredClone(existing);
    }
    const row: LinkRule = {
      id: this.seq,
      chatId: input.chatId,
      domain: input.domain,
      list: input.list,
      action: input.action,
      note: input.note ?? null,
      createdAt: new Date(),
    };
    this.seq += 1;
    this.rows.push(row);
    return structuredClone(row);
  }

  async delete(chatId: string, domain: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.chatId === chatId && row.domain === domain);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

export class MemoryWhitelistRepository implements WhitelistRepository {
  private readonly rows: WhitelistEntry[] = [];

  async has(chatId: string, userId: string): Promise<boolean> {
    return this.rows.some((row) => row.chatId === chatId && row.userId === userId);
  }

  async add(
    entry: Omit<WhitelistEntry, 'createdAt'> & { createdAt?: Date },
  ): Promise<WhitelistEntry> {
    const existing = this.rows.find(
      (row) => row.chatId === entry.chatId && row.userId === entry.userId,
    );
    if (existing) {
      existing.reason = entry.reason;
      existing.createdBy = entry.createdBy;
      return structuredClone(existing);
    }
    const row: WhitelistEntry = { ...entry, createdAt: entry.createdAt ?? new Date() };
    this.rows.push(row);
    return structuredClone(row);
  }

  async remove(chatId: string, userId: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.chatId === chatId && row.userId === userId);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

export class MemoryViolationRepository implements ViolationRepository {
  private seq = 1;
  private readonly rows: Violation[] = [];

  async insertIfNew(input: NewViolation): Promise<Violation | null> {
    const duplicate = this.rows.some(
      (row) => row.chatId === input.chatId && row.messageId === input.messageId,
    );
    if (duplicate) return null;
    const row: Violation = { ...input, id: this.seq, createdAt: new Date() };
    this.seq += 1;
    this.rows.push(row);
    return structuredClone(row);
  }

  async listByUser(chatId: string, userId: string, limit: number): Promise<Violation[]> {
    return this.rows
      .filter((row) => row.chatId === chatId && row.userId === userId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }

  async countByUser(chatId: string, userId: string): Promise<number> {
    return this.rows.filter((row) => row.chatId === chatId && row.userId === userId).length;
  }
}

export class MemoryAuditRepository implements AuditRepository {
  private seq = 1;
  private readonly rows: AuditLog[] = [];

  async insert(input: NewAuditLog): Promise<AuditLog> {
    const row: AuditLog = {
      id: this.seq,
      chatId: input.chatId,
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      action: input.action,
      reason: input.reason,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.seq += 1;
    this.rows.push(row);
    return structuredClone(row);
  }

  async listRecent(chatId: string, limit: number): Promise<AuditLog[]> {
    return this.rows
      .filter((row) => row.chatId === chatId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }
}

export class MemoryAdminRoleRepository implements AdminRoleRepository {
  private readonly rows: AdminRole[] = [];

  async get(chatId: string, userId: string): Promise<AdminRole | null> {
    const row = this.rows.find((item) => item.chatId === chatId && item.userId === userId);
    return row ? structuredClone(row) : null;
  }

  async upsert(chatId: string, userId: string, role: AdminRoleName): Promise<AdminRole> {
    const existing = this.rows.find((item) => item.chatId === chatId && item.userId === userId);
    if (existing) {
      existing.role = role;
      return structuredClone(existing);
    }
    const row: AdminRole = { chatId, userId, role, createdAt: new Date() };
    this.rows.push(row);
    return structuredClone(row);
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    settings: new MemorySettingsRepository(),
    filters: new MemoryFilterRepository(),
    links: new MemoryLinkRuleRepository(),
    whitelist: new MemoryWhitelistRepository(),
    violations: new MemoryViolationRepository(),
    audit: new MemoryAuditRepository(),
    roles: new MemoryAdminRoleRepository(),
  };
}
