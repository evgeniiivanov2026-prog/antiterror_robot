import type { KeyValueCache } from '../cache/cache.js';
import type { AdminRoleRepository } from '../database/repositories/types.js';
import type { MaxGateway } from '../max/gateway.js';
import type { AppLogger } from '../utils/logger.js';

export type Privilege = 'privileged' | 'member' | 'unknown';

export class PermissionService {
  constructor(
    private readonly deps: {
      adminIds: Set<string>;
      roles: AdminRoleRepository;
      gateway: MaxGateway;
      cache: KeyValueCache;
      logger: AppLogger;
    },
  ) {}

  async resolve(chatId: string, userId: string): Promise<Privilege> {
    if (this.deps.adminIds.has(userId)) return 'privileged';
    const role = await this.deps.roles.get(chatId, userId);
    if (role) return 'privileged';

    const cacheKey = `priv:${chatId}:${userId}`;
    const cached = await this.deps.cache.get(cacheKey);
    if (cached === 'privileged' || cached === 'member') return cached;

    try {
      const members = await this.deps.gateway.getMembers(chatId, [userId]);
      const member = members.find((item) => item.userId === userId);
      const privilege: Privilege =
        member && (member.isAdmin || member.isOwner) ? 'privileged' : 'member';
      await this.deps.cache.set(cacheKey, privilege, 30);
      return privilege;
    } catch (error) {
      this.deps.logger.warn(
        { err: error instanceof Error ? error.message : 'lookup', chatId },
        'admin lookup failed',
      );
      return 'unknown';
    }
  }

  async adminRecipients(chatId: string): Promise<string[]> {
    const ids = new Set<string>(this.deps.adminIds);
    try {
      for (const id of await this.deps.gateway.getAdminIds(chatId)) ids.add(id);
    } catch (error) {
      this.deps.logger.warn(
        { err: error instanceof Error ? error.message : 'admins', chatId },
        'admin list failed',
      );
    }
    return [...ids];
  }
}
