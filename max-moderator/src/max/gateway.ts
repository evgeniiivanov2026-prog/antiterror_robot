export interface ChatMemberInfo {
  userId: string;
  isOwner: boolean;
  isAdmin: boolean;
  isBot: boolean;
  permissions: string[];
}

export interface RecentMessage {
  messageId: string;
  userId: string | null;
}

export interface MaxGateway {
  deleteMessage(messageId: string): Promise<void>;
  sendChatMessage(chatId: string, text: string): Promise<void>;
  sendUserMessage(userId: string, text: string): Promise<void>;
  getAdminIds(chatId: string): Promise<string[]>;
  getMembers(chatId: string, userIds: string[]): Promise<ChatMemberInfo[]>;
  getBotPermissions(chatId: string): Promise<string[]>;
  removeMember(chatId: string, userId: string): Promise<void>;
  listRecentMessages(chatId: string, count: number): Promise<RecentMessage[]>;
}

export class FakeMaxGateway implements MaxGateway {
  readonly deleted: string[] = [];
  readonly chatMessages: Array<{ chatId: string; text: string }> = [];
  readonly userMessages: Array<{ userId: string; text: string }> = [];
  readonly kicked: Array<{ chatId: string; userId: string }> = [];
  members: ChatMemberInfo[] = [];
  permissions: string[] = ['read_all_messages', 'write'];
  recent: RecentMessage[] = [];
  failDelete = false;
  failSend = false;

  async deleteMessage(messageId: string): Promise<void> {
    if (this.failDelete) throw new Error('max delete failed');
    this.deleted.push(messageId);
  }

  async sendChatMessage(chatId: string, text: string): Promise<void> {
    if (this.failSend) throw new Error('max send failed');
    this.chatMessages.push({ chatId, text });
  }

  async sendUserMessage(userId: string, text: string): Promise<void> {
    if (this.failSend) throw new Error('max send failed');
    this.userMessages.push({ userId, text });
  }

  async getAdminIds(chatId: string): Promise<string[]> {
    void chatId;
    return this.members
      .filter((member) => member.isAdmin || member.isOwner)
      .map((member) => member.userId);
  }

  async getMembers(chatId: string, userIds: string[]): Promise<ChatMemberInfo[]> {
    void chatId;
    if (userIds.length === 0) return this.members;
    return this.members.filter((member) => userIds.includes(member.userId));
  }

  async getBotPermissions(): Promise<string[]> {
    return this.permissions;
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    this.kicked.push({ chatId, userId });
  }

  async listRecentMessages(_chatId: string, count: number): Promise<RecentMessage[]> {
    return this.recent.slice(0, count);
  }
}
