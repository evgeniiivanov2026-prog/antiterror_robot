import type { AuditRepository } from '../database/repositories/types.js';
import type { AuditRecord } from '../domain/types.js';
import { logger } from '../utils/logger.js';

export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  async record(input: Omit<AuditRecord, 'id' | 'createdAt'>): Promise<void> {
    await this.audit.append({
      ...input,
      reason: input.reason.slice(0, 500),
    });
    logger.info(
      {
        chatId: input.chatId,
        action: input.action,
        targetUserId: input.targetUserId,
        reason: input.reason,
      },
      'moderation audit',
    );
  }

  listRecent(chatId: string, limit: number): Promise<AuditRecord[]> {
    return this.audit.listRecent(chatId, limit);
  }
}
