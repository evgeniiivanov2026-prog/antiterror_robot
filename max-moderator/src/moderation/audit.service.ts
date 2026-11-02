import type { AuditRepository } from '../database/repositories/types.js';
import type { AuditLog, NewAuditLog } from './types.js';

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  record(entry: NewAuditLog): Promise<AuditLog> {
    return this.repository.write({
      ...entry,
      metadata: this.minimize(entry.metadata ?? {}),
    });
  }

  listRecent(chatId: string, limit = 20): Promise<AuditLog[]> {
    return this.repository.listRecent(chatId, Math.min(Math.max(limit, 1), 50));
  }

  private minimize(metadata: Record<string, unknown>): Record<string, unknown> {
    const hidden = new Set(['text', 'messageText', 'body', 'token', 'authorization']);
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (hidden.has(key)) continue;
      if (typeof value === 'string') {
        output[key] = value.slice(0, 300);
        continue;
      }
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        output[key] = value;
      }
    }
    return output;
  }
}
