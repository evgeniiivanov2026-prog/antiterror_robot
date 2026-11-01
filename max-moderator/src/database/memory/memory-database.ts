import type { AppEnv } from '../../config/env.js';
import type {
  AdminRole,
  AuditLog,
  ChatSettings,
  LinkRule,
  NewAuditLog,
  NewLinkRule,
  NewViolation,
  NewWordFilter,
  Violation,
  WhitelistEntry,
  WordFilter,
} from '../../moderation/types.js';
import { defaultChatSettings } from '../defaults.js';
import type { Repositories } from '../repositories/types.js';

export function createMemoryRepositories(
  defaults: Pick<AppEnv, 'defaultLinkMode' | 'defaultWordAction'>,
): Repositories {
  const settingsRows = new Map<string, ChatSettings>();
  const filterRows: WordFilter[] = [];
  const linkRows: LinkRule[] = [];
  const whitelistRows: WhitelistEntry[] = [];
  const violationRows: Violation[] = [];
  const auditRows: AuditLog[] = [];
  const roleRows: AdminRole[] = [];
  const events = new Map<string, { createdAt: Date }>();
  let filterSeq = 1;
  let linkSeq = 1;
  let violationSeq = 1;
  let auditSeq = 1;

  const patchFilter = (
    chatId: string,
    id: number,
    patch: Partial<Pick<WordFilter, 'enabled' | 'action' | 'severity'>>,
  ): WordFilter | null => {
    const found = filterRows.find((filter) => filter.chatId === chatId && filter.id === id);
    if (!found) return null;
    Object.assign(found, patch, { updatedAt: new Date() });
    return structuredClone(found);
  };

  return {
    settings: {
      async getOrCreate(chatId) {
        const existing = settingsRows.get(chatId);
        if (existing) return structuredClone(existing);
        const created = defaultChatSettings(chatId, defaults);
        settingsRows.set(chatId, created);
        return structuredClone(created);
      },
      async update(chatId, patch) {
        const current = settingsRows.get(chatId) ?? defaultChatSettings(chatId, defaults);
        const next = { ...current, ...patch, chatId, updatedAt: new Date() };
        settingsRows.set(chatId, next);
        return structuredClone(next);
      },
    },
    filters: {
      async list(chatId, enabledOnly = false) {
        return filterRows
          .filter((filter) => filter.chatId === chatId && (!enabledOnly || filter.enabled))
          .map((filter) => structuredClone(filter));
      },
      async create(input: NewWordFilter) {
        const now = new Date();
        const row: WordFilter = {
          id: filterSeq,
          chatId: input.chatId,
          type: input.type,
          pattern: input.pattern,
          action: input.action,
          severity: input.severity,
          enabled: input.enabled ?? true,
          wholeWord: input.wholeWord ?? true,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        };
        filterSeq += 1;
        filterRows.push(row);
        return structuredClone(row);
      },
      async find(chatId, id) {
        const found = filterRows.find((filter) => filter.chatId === chatId && filter.id === id);
        return found ? structuredClone(found) : null;
      },
      async remove(chatId, id) {
        const before = filterRows.length;
        const next = filterRows.filter((filter) => !(filter.chatId === chatId && filter.id === id));
        filterRows.splice(0, filterRows.length, ...next);
        return filterRows.length !== before;
      },
      async setEnabled(chatId, id, enabled) {
        return patchFilter(chatId, id, { enabled });
      },
      async setAction(chatId, id, action) {
        return patchFilter(chatId, id, { action });
      },
      async setSeverity(chatId, id, severity) {
        return patchFilter(chatId, id, { severity });
      },
      async clear(chatId) {
        const before = filterRows.length;
        const next = filterRows.filter((filter) => filter.chatId !== chatId);
        const removed = before - next.length;
        filterRows.splice(0, filterRows.length, ...next);
        return removed;
      },
    },
    links: {
      async list(chatId) {
        return linkRows
          .filter((rule) => rule.chatId === chatId)
          .map((rule) => structuredClone(rule));
      },
      async upsert(input: NewLinkRule) {
        const existing = linkRows.find(
          (rule) => rule.chatId === input.chatId && rule.domain === input.domain,
        );
        const now = new Date();
        if (existing) {
          existing.list = input.list;
          existing.action = input.action;
          existing.note = input.note ?? existing.note;
          existing.updatedAt = now;
          return structuredClone(existing);
        }
        const row: LinkRule = {
          id: linkSeq,
          chatId: input.chatId,
          domain: input.domain,
          list: input.list,
          action: input.action,
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        };
        linkSeq += 1;
        linkRows.push(row);
        return structuredClone(row);
      },
      async remove(chatId, domain) {
        const before = linkRows.length;
        const next = linkRows.filter((rule) => !(rule.chatId === chatId && rule.domain === domain));
        linkRows.splice(0, linkRows.length, ...next);
        return linkRows.length !== before;
      },
    },
    whitelist: {
      async list(chatId) {
        return whitelistRows
          .filter((entry) => entry.chatId === chatId)
          .map((entry) => structuredClone(entry));
      },
      async has(chatId, userId) {
        return whitelistRows.some((entry) => entry.chatId === chatId && entry.userId === userId);
      },
      async add(chatId, userId, createdBy, reason) {
        const existing = whitelistRows.find(
          (entry) => entry.chatId === chatId && entry.userId === userId,
        );
        if (existing) {
          existing.reason = reason ?? existing.reason;
          existing.createdBy = createdBy;
          return structuredClone(existing);
        }
        const row: WhitelistEntry = {
          chatId,
          userId,
          reason: reason ?? null,
          createdBy,
          createdAt: new Date(),
        };
        whitelistRows.push(row);
        return structuredClone(row);
      },
      async remove(chatId, userId) {
        const before = whitelistRows.length;
        const next = whitelistRows.filter(
          (entry) => !(entry.chatId === chatId && entry.userId === userId),
        );
        whitelistRows.splice(0, whitelistRows.length, ...next);
        return whitelistRows.length !== before;
      },
    },
    violations: {
      async insertIfAbsent(input: NewViolation) {
        const existing = violationRows.find(
          (row) => row.chatId === input.chatId && row.messageId === input.messageId,
        );
        if (existing) return { created: false, row: structuredClone(existing) };
        const row: Violation = { ...input, id: violationSeq, createdAt: new Date() };
        violationSeq += 1;
        violationRows.push(row);
        return { created: true, row: structuredClone(row) };
      },
      async exists(chatId, messageId) {
        return violationRows.some((row) => row.chatId === chatId && row.messageId === messageId);
      },
      async listByUser(chatId, userId, limit) {
        return violationRows
          .filter((row) => row.chatId === chatId && row.userId === userId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, limit)
          .map((row) => structuredClone(row));
      },
      async countByUser(chatId, userId) {
        return violationRows.filter((row) => row.chatId === chatId && row.userId === userId).length;
      },
    },
    audit: {
      async write(entry: NewAuditLog) {
        const row: AuditLog = {
          id: auditSeq,
          chatId: entry.chatId,
          actorId: entry.actorId,
          targetUserId: entry.targetUserId,
          action: entry.action,
          reason: entry.reason,
          metadata: entry.metadata ?? {},
          createdAt: new Date(),
        };
        auditSeq += 1;
        auditRows.push(row);
        return structuredClone(row);
      },
      async listRecent(chatId, limit) {
        return auditRows
          .filter((row) => row.chatId === chatId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, limit)
          .map((row) => structuredClone(row));
      },
    },
    roles: {
      async getRole(chatId, userId) {
        return (
          roleRows.find((role) => role.chatId === chatId && role.userId === userId)?.role ?? null
        );
      },
      async upsert(chatId, userId, role) {
        const existing = roleRows.find((item) => item.chatId === chatId && item.userId === userId);
        if (existing) {
          existing.role = role;
          return structuredClone(existing);
        }
        const row: AdminRole = { chatId, userId, role, createdAt: new Date() };
        roleRows.push(row);
        return structuredClone(row);
      },
    },
    events: {
      async claim(chatId, messageId, eventKey) {
        if (events.has(eventKey)) return false;
        events.set(eventKey, { createdAt: new Date() });
        void chatId;
        void messageId;
        return true;
      },
      async deleteOlderThan(before) {
        let removed = 0;
        for (const [key, value] of events) {
          if (value.createdAt < before) {
            events.delete(key);
            removed += 1;
          }
        }
        return removed;
      },
    },
  };
}
