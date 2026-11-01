import type { NewAuditLog } from '../domain/models.js';
import type { AuditRepository } from '../database/repositories/types.js';
import type { AppLogger } from '../utils/logger.js';

const SENSITIVE_KEYS = new Set(['text', 'token', 'authorization', 'message', 'body', 'password']);

export class AuditService {
  constructor(
    private readonly audit: AuditRepository,
    private readonly logger: AppLogger,
  ) {}

  async record(input: NewAuditLog): Promise<void> {
    const metadata = sanitizeMetadata(input.metadata ?? {});
    await this.audit.insert({ ...input, metadata });
    this.logger.info(
      {
        chatId: input.chatId,
        action: input.action,
        actorId: input.actorId,
        targetUserId: input.targetUserId,
      },
      'audit',
    );
  }
}

export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') next[key] = value.slice(0, 200);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null)
      next[key] = value;
  }
  return next;
}
