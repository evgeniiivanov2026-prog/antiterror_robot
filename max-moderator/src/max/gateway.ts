export interface MemberSnapshot {
  userId: string;
  isAdmin: boolean;
  isOwner: boolean;
  isBot: boolean;
}

export interface BotMembership {
  isAdmin: boolean;
  permissions: string[];
}

export interface RecentMessage {
  messageId: string;
  senderId?: string;
}

export interface MaxGateway {
  deleteMessage(messageId: string): Promise<void>;
  sendChatMessage(chatId: string, text: string): Promise<void>;
  sendUserMessage(userId: string, text: string): Promise<void>;
  getMember(chatId: string, userId: string): Promise<MemberSnapshot | null>;
  getBotMembership(chatId: string): Promise<BotMembership | null>;
  getAdmins(chatId: string): Promise<MemberSnapshot[]>;
  removeMember(chatId: string, userId: string): Promise<void>;
  listRecentMessages(chatId: string, count: number): Promise<RecentMessage[]>;
}

const DELETE_PERMISSIONS = new Set([
  'write',
  'post_edit_delete_message',
  'delete',
  'delete_message',
]);

export function hasDeletePermission(membership: BotMembership | null): boolean {
  if (!membership?.isAdmin) return false;
  return membership.permissions.some((permission) => DELETE_PERMISSIONS.has(permission));
}

export function toApiId(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`MAX id "${value}" is not an integer`);
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`MAX id "${value}" is outside the safe integer range of the current SDK`);
  }
  return numeric;
}
