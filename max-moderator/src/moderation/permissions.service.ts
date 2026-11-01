import type { CacheStore } from '../cache/cache-store.js';
import type { AppConfig } from '../config/env.js';
import type { Repositories } from '../database/repositories/types.js';
import type { IncomingMessage, PlatformAdmin } from '../domain/types.js';
import { logger } from '../utils/logger.js';
import type { MaxClient } from '../max/max-client.js';

export class PermissionService {
  constructor(
    private readonly repos: Repositories,
    private readonly store: CacheStore,
    private readonly max: MaxClient,
    private readonly config: Pick<AppConfig, 'adminIds'>,
  ) {}

  async isCommandAdmin(message: IncomingMessage): Promise<boolean> {
    if (this.config.adminIds.has(message.userId)) return true;
    const role = await this.repos.admins.get(message.chatId, message.userId);
    if (role) return true;
    const admins = await this.lookup(message.chatId);
    if (!admins) return false;
    return admins.some(
      (admin) => admin.userId === message.userId && (admin.isAdmin || admin.isOwner),
    );
  }

  async canGrant(message: IncomingMessage): Promise<boolean> {
    if (this.config.adminIds.has(message.userId)) return true;
    const admins = await this.lookup(message.chatId);
    if (!admins) return false;
    return admins.some((admin) => admin.userId === message.userId && admin.isOwner);
  }

  async exemption(message: IncomingMessage): Promise<{ exempt: boolean; reason: string }> {
    if (message.isBot) return { exempt: true, reason: 'bot' };
    if (this.config.adminIds.has(message.userId)) return { exempt: true, reason: 'admin_ids' };
    if (await this.repos.whitelist.has(message.chatId, message.userId)) {
      return { exempt: true, reason: 'whitelist' };
    }
    const role = await this.repos.admins.get(message.chatId, message.userId);
    if (role) return { exempt: true, reason: 'db_admin' };
    const admins = await this.lookup(message.chatId);
    if (!admins) return { exempt: true, reason: 'permissions_unknown' };
    const member = admins.find((admin) => admin.userId === message.userId);
    if (member?.isAdmin || member?.isOwner) return { exempt: true, reason: 'chat_admin' };
    return { exempt: false, reason: '' };
  }

  private async lookup(chatId: string): Promise<PlatformAdmin[] | null> {
    const key = `admins:${chatId}`;
    const cached = await this.readCache(key);
    try {
      const admins = await this.max.getAdmins(chatId);
      await this.store.set(key, JSON.stringify(admins), 45);
      return admins;
    } catch (error) {
      logger.warn({ err: error, chatId }, 'admin lookup failed');
      return cached;
    }
  }

  private async readCache(key: string): Promise<PlatformAdmin[] | null> {
    const raw = await this.store.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PlatformAdmin[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
