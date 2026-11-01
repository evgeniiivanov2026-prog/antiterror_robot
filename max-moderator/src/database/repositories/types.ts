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
import type { AdminRoleName, LinkList, ModerationAction } from '../../domain/enums.js';

export interface SettingsRepository {
  get(chatId: string): Promise<ChatSettings | null>;
  ensure(settings: ChatSettings): Promise<ChatSettings>;
  save(settings: ChatSettings): Promise<ChatSettings>;
}

export interface FilterRepository {
  list(chatId: string, enabledOnly?: boolean): Promise<WordFilter[]>;
  findById(chatId: string, id: number): Promise<WordFilter | null>;
  create(input: NewWordFilter): Promise<WordFilter>;
  save(filter: WordFilter): Promise<WordFilter>;
  delete(chatId: string, id: number): Promise<boolean>;
  deleteAll(chatId: string): Promise<number>;
}

export interface LinkRuleRepository {
  list(chatId: string): Promise<LinkRule[]>;
  upsert(input: {
    chatId: string;
    domain: string;
    list: LinkList;
    action: ModerationAction;
    note?: string | null;
  }): Promise<LinkRule>;
  delete(chatId: string, domain: string): Promise<boolean>;
}

export interface WhitelistRepository {
  has(chatId: string, userId: string): Promise<boolean>;
  add(entry: Omit<WhitelistEntry, 'createdAt'> & { createdAt?: Date }): Promise<WhitelistEntry>;
  remove(chatId: string, userId: string): Promise<boolean>;
}

export interface ViolationRepository {
  insertIfNew(input: NewViolation): Promise<Violation | null>;
  listByUser(chatId: string, userId: string, limit: number): Promise<Violation[]>;
  countByUser(chatId: string, userId: string): Promise<number>;
}

export interface AuditRepository {
  insert(input: NewAuditLog): Promise<AuditLog>;
  listRecent(chatId: string, limit: number): Promise<AuditLog[]>;
}

export interface AdminRoleRepository {
  get(chatId: string, userId: string): Promise<AdminRole | null>;
  upsert(chatId: string, userId: string, role: AdminRoleName): Promise<AdminRole>;
}

export interface Repositories {
  settings: SettingsRepository;
  filters: FilterRepository;
  links: LinkRuleRepository;
  whitelist: WhitelistRepository;
  violations: ViolationRepository;
  audit: AuditRepository;
  roles: AdminRoleRepository;
}
