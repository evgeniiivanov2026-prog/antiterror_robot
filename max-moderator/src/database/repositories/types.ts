import type { AdminRoleName, RuleType } from '../../domain/enums.js';
import type {
  AdminRoleRecord,
  AuditRecord,
  ChatSettingsRecord,
  LinkRuleRecord,
  ViolationRecord,
  WhitelistRecord,
  WordFilterRecord,
} from '../../domain/types.js';

export interface ChatSettingsRepository {
  get(chatId: string): Promise<ChatSettingsRecord | null>;
  create(settings: ChatSettingsRecord): Promise<ChatSettingsRecord>;
  save(settings: ChatSettingsRecord): Promise<ChatSettingsRecord>;
}

export interface WordFilterRepository {
  list(chatId: string, enabledOnly?: boolean): Promise<WordFilterRecord[]>;
  getById(chatId: string, id: number): Promise<WordFilterRecord | null>;
  create(
    input: Omit<WordFilterRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WordFilterRecord>;
  update(
    chatId: string,
    id: number,
    patch: Partial<Pick<WordFilterRecord, 'enabled' | 'action' | 'severity' | 'pattern'>>,
  ): Promise<WordFilterRecord | null>;
  remove(chatId: string, id: number): Promise<boolean>;
  clear(chatId: string): Promise<number>;
}

export interface LinkRuleRepository {
  list(chatId: string): Promise<LinkRuleRecord[]>;
  upsert(input: Omit<LinkRuleRecord, 'id'>): Promise<LinkRuleRecord>;
  remove(chatId: string, domain: string): Promise<boolean>;
}

export interface WhitelistRepository {
  list(chatId: string): Promise<WhitelistRecord[]>;
  has(chatId: string, userId: string): Promise<boolean>;
  add(input: WhitelistRecord): Promise<void>;
  remove(chatId: string, userId: string): Promise<boolean>;
}

export interface ViolationInsert {
  chatId: string;
  userId: string;
  messageId: string;
  contentHash: string;
  ruleId: number | null;
  violationType: RuleType;
  severity: ViolationRecord['severity'];
  action: ViolationRecord['action'];
  reason: string;
}

export interface ViolationRepository {
  insert(input: ViolationInsert): Promise<'created' | 'duplicate'>;
  countSince(chatId: string, userId: string, types: RuleType[], sinceMs: number): Promise<number>;
  listByUser(chatId: string, userId: string, limit: number): Promise<ViolationRecord[]>;
}

export interface AuditRepository {
  append(input: Omit<AuditRecord, 'id' | 'createdAt'> & { createdAt?: Date }): Promise<AuditRecord>;
  listRecent(chatId: string, limit: number): Promise<AuditRecord[]>;
}

export interface AdminRoleRepository {
  get(chatId: string, userId: string): Promise<AdminRoleRecord | null>;
  upsert(input: AdminRoleRecord): Promise<void>;
  remove(chatId: string, userId: string): Promise<boolean>;
}

export interface ProcessedEventRepository {
  tryInsert(chatId: string, messageId: string, contentHash: string): Promise<boolean>;
}

export interface RestrictionRepository {
  mute(chatId: string, userId: string, untilMs: number, reason: string): Promise<void>;
  activeMute(chatId: string, userId: string, nowMs: number): Promise<boolean>;
}

export interface Repositories {
  settings: ChatSettingsRepository;
  filters: WordFilterRepository;
  links: LinkRuleRepository;
  whitelist: WhitelistRepository;
  violations: ViolationRepository;
  audit: AuditRepository;
  admins: AdminRoleRepository;
  processed: ProcessedEventRepository;
  restrictions: RestrictionRepository;
}

export type AdminRoleInput = AdminRoleName;
