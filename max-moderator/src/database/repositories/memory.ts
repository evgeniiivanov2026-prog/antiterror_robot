import type { RuleType } from '../../domain/enums.js';
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

export function createMemoryRepositories(): Repositories {
  const settings = new Map<string, ChatSettingsRecord>();
  const filters: WordFilterRecord[] = [];
  const links: LinkRuleRecord[] = [];
  const whitelist: WhitelistRecord[] = [];
  const violations: ViolationRecord[] = [];
  const audits: AuditRecord[] = [];
  const admins: AdminRoleRecord[] = [];
  const processed = new Set<string>();
  const mutes: Array<{ chatId: string; userId: string; untilMs: number }> = [];
  let filterId = 1;
  let linkId = 1;
  let violationId = 1;
  let auditId = 1;

  return {
    settings: {
      async get(chatId) {
        return settings.get(chatId) ?? null;
      },
      async create(input) {
        if (settings.has(input.chatId)) return settings.get(input.chatId) as ChatSettingsRecord;
        settings.set(input.chatId, { ...input });
        return { ...input };
      },
      async save(input) {
        settings.set(input.chatId, { ...input });
        return { ...input };
      },
    },
    filters: {
      async list(chatId, enabledOnly) {
        return filters.filter((item) => item.chatId === chatId && (!enabledOnly || item.enabled));
      },
      async getById(chatId, id) {
        return filters.find((item) => item.chatId === chatId && item.id === id) ?? null;
      },
      async create(input) {
        const now = new Date();
        const row: WordFilterRecord = { ...input, id: filterId, createdAt: now, updatedAt: now };
        filterId += 1;
        filters.push(row);
        return row;
      },
      async update(chatId, id, patch) {
        const row = filters.find((item) => item.chatId === chatId && item.id === id);
        if (!row) return null;
        Object.assign(row, patch, { updatedAt: new Date() });
        return row;
      },
      async remove(chatId, id) {
        const index = filters.findIndex((item) => item.chatId === chatId && item.id === id);
        if (index < 0) return false;
        filters.splice(index, 1);
        return true;
      },
      async clear(chatId) {
        const before = filters.length;
        for (let index = filters.length - 1; index >= 0; index -= 1) {
          if (filters[index]?.chatId === chatId) filters.splice(index, 1);
        }
        return before - filters.length;
      },
    },
    links: {
      async list(chatId) {
        return links.filter((item) => item.chatId === chatId);
      },
      async upsert(input) {
        const existing = links.find(
          (item) => item.chatId === input.chatId && item.domain === input.domain,
        );
        if (existing) {
          existing.list = input.list;
          existing.action = input.action;
          existing.note = input.note;
          return existing;
        }
        const row: LinkRuleRecord = { ...input, id: linkId };
        linkId += 1;
        links.push(row);
        return row;
      },
      async remove(chatId, domain) {
        const index = links.findIndex((item) => item.chatId === chatId && item.domain === domain);
        if (index < 0) return false;
        links.splice(index, 1);
        return true;
      },
    },
    whitelist: {
      async list(chatId) {
        return whitelist.filter((item) => item.chatId === chatId);
      },
      async has(chatId, userId) {
        return whitelist.some((item) => item.chatId === chatId && item.userId === userId);
      },
      async add(input) {
        if (whitelist.some((item) => item.chatId === input.chatId && item.userId === input.userId))
          return;
        whitelist.push({ ...input });
      },
      async remove(chatId, userId) {
        const index = whitelist.findIndex(
          (item) => item.chatId === chatId && item.userId === userId,
        );
        if (index < 0) return false;
        whitelist.splice(index, 1);
        return true;
      },
    },
    violations: {
      async insert(input: ViolationInsert) {
        const duplicate = violations.some(
          (item) =>
            item.chatId === input.chatId &&
            item.messageId === input.messageId &&
            item.contentHash === input.contentHash,
        );
        if (duplicate) return 'duplicate';
        violations.push({
          ...input,
          id: violationId,
          createdAt: new Date(),
        });
        violationId += 1;
        return 'created';
      },
      async countSince(chatId, userId, types: RuleType[], sinceMs) {
        return violations.filter(
          (item) =>
            item.chatId === chatId &&
            item.userId === userId &&
            types.includes(item.violationType) &&
            item.createdAt.getTime() >= sinceMs,
        ).length;
      },
      async listByUser(chatId, userId, limit) {
        return violations
          .filter((item) => item.chatId === chatId && item.userId === userId)
          .slice(-limit)
          .reverse();
      },
    },
    audit: {
      async append(input) {
        const row: AuditRecord = {
          id: auditId,
          chatId: input.chatId,
          actorId: input.actorId,
          targetUserId: input.targetUserId,
          action: input.action,
          reason: input.reason,
          metadata: input.metadata,
          createdAt: input.createdAt ?? new Date(),
        };
        auditId += 1;
        audits.push(row);
        return row;
      },
      async listRecent(chatId, limit) {
        return audits
          .filter((item) => item.chatId === chatId)
          .slice(-limit)
          .reverse();
      },
    },
    admins: {
      async get(chatId, userId) {
        return admins.find((item) => item.chatId === chatId && item.userId === userId) ?? null;
      },
      async upsert(input) {
        const existing = admins.find(
          (item) => item.chatId === input.chatId && item.userId === input.userId,
        );
        if (existing) {
          existing.role = input.role;
          existing.createdBy = input.createdBy;
          return;
        }
        admins.push({ ...input });
      },
      async remove(chatId, userId) {
        const index = admins.findIndex((item) => item.chatId === chatId && item.userId === userId);
        if (index < 0) return false;
        admins.splice(index, 1);
        return true;
      },
    },
    processed: {
      async tryInsert(chatId, messageId, contentHash) {
        const key = `${chatId}:${messageId}:${contentHash}`;
        if (processed.has(key)) return false;
        processed.add(key);
        return true;
      },
    },
    restrictions: {
      async mute(chatId, userId, untilMs) {
        mutes.push({ chatId, userId, untilMs });
      },
      async activeMute(chatId, userId, nowMs) {
        return mutes.some(
          (item) => item.chatId === chatId && item.userId === userId && item.untilMs > nowMs,
        );
      },
    },
  };
}
