import type { JsonCache, KeyValue } from '../database/cache.js';
import type { Repositories } from '../database/repositories/types.js';
import type { MaxGateway } from '../max/gateway.js';
import type { IncomingMessage } from './incoming.js';

export class PrivilegeService {
  constructor(
    private readonly repositories: Repositories,
    private readonly gateway: MaxGateway,
    private readonly cache: JsonCache,
    private readonly kv: KeyValue,
    private readonly adminIds: string[],
  ) {}

  async canCommand(message: IncomingMessage): Promise<boolean> {
    if (this.adminIds.includes(message.userId)) return true;
    const role = await this.repositories.roles.getRole(message.chatId, message.userId);
    if (role === 'ADMIN' || role === 'OWNER') return true;
    const key = `priv:${message.chatId}:${message.userId}`;
    const cached = await this.kv.get(key);
    if (cached === 'admin' || cached === 'owner') return true;
    if (cached === 'member') return false;
    const member = await this.gateway.getMember(message.chatId, message.userId);
    if (!member) {
      await this.kv.set(key, 'member', 30);
      return false;
    }
    const kind = member.isOwner ? 'owner' : member.isAdmin ? 'admin' : 'member';
    await this.kv.set(key, kind, kind === 'member' ? 30 : 120);
    if (kind === 'member') return false;
    await this.repositories.roles.upsert(
      message.chatId,
      message.userId,
      kind === 'owner' ? 'OWNER' : 'ADMIN',
    );
    return true;
  }

  async isExempt(message: IncomingMessage): Promise<boolean> {
    if (await this.canCommand(message)) return true;
    const entries = await this.cache.remember(
      `whitelist:${message.chatId}`,
      60,
      () => this.repositories.whitelist.list(message.chatId),
      (value) => value.map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt) })),
    );
    return entries.some((entry) => entry.userId === message.userId);
  }
}
