import type {
  AdminRole,
  AdminRoleName,
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
import type { ModerationAction } from '../../moderation/types.js';
import type { Severity } from '../../moderation/severity.js';

export interface ChatSettingsRepository {
  getOrCreate(chatId: string): Promise<ChatSettings>;
  update(
    chatId: string,
    patch: Partial<Omit<ChatSettings, 'chatId' | 'createdAt'>>,
  ): Promise<ChatSettings>;
}

export interface WordFilterRepository {
  list(chatId: string, enabledOnly?: boolean): Promise<WordFilter[]>;
  create(input: NewWordFilter): Promise<WordFilter>;
  find(chatId: string, id: number): Promise<WordFilter | null>;
  remove(chatId: string, id: number): Promise<boolean>;
  setEnabled(chatId: string, id: number, enabled: boolean): Promise<WordFilter | null>;
  setAction(chatId: string, id: number, action: ModerationAction): Promise<WordFilter | null>;
  setSeverity(chatId: string, id: number, severity: Severity): Promise<WordFilter | null>;
  clear(chatId: string): Promise<number>;
}

export interface LinkRuleRepository {
  list(chatId: string): Promise<LinkRule[]>;
  upsert(input: NewLinkRule): Promise<LinkRule>;
  remove(chatId: string, domain: string): Promise<boolean>;
}

export interface WhitelistRepository {
  list(chatId: string): Promise<WhitelistEntry[]>;
  has(chatId: string, userId: string): Promise<boolean>;
  add(
    chatId: string,
    userId: string,
    createdBy: string,
    reason?: string | null,
  ): Promise<WhitelistEntry>;
  remove(chatId: string, userId: string): Promise<boolean>;
}

export interface ViolationRepository {
  insertIfAbsent(input: NewViolation): Promise<{ created: boolean; row: Violation }>;
  exists(chatId: string, messageId: string): Promise<boolean>;
  listByUser(chatId: string, userId: string, limit: number): Promise<Violation[]>;
  countByUser(chatId: string, userId: string): Promise<number>;
}

export interface AuditRepository {
  write(entry: NewAuditLog): Promise<AuditLog>;
  listRecent(chatId: string, limit: number): Promise<AuditLog[]>;
}

export interface AdminRoleRepository {
  getRole(chatId: string, userId: string): Promise<AdminRoleName | null>;
  upsert(chatId: string, userId: string, role: AdminRoleName): Promise<AdminRole>;
}

export interface ProcessedEventRepository {
  claim(chatId: string, messageId: string, eventKey: string): Promise<boolean>;
  deleteOlderThan(before: Date): Promise<number>;
}

export interface Repositories {
  settings: ChatSettingsRepository;
  filters: WordFilterRepository;
  links: LinkRuleRepository;
  whitelist: WhitelistRepository;
  violations: ViolationRepository;
  audit: AuditRepository;
  roles: AdminRoleRepository;
  events: ProcessedEventRepository;
}
