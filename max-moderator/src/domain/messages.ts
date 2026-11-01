import { Decision, ModerationAction, RuleType, Severity } from './enums.js';

export interface IncomingMessage {
  chatId: string;
  chatType: 'dialog' | 'chat' | 'channel';
  userId: string;
  isBot: boolean;
  messageId: string;
  text: string;
  urls: string[];
  hasMedia: boolean;
  isForward: boolean;
  mentionCount: number;
  timestamp: number;
}

export interface FilterHit {
  ruleId: number | null;
  type: RuleType;
  action: ModerationAction;
  severity: Severity;
  reason: string;
  pattern?: string;
}

export interface ModerationDecision {
  decision: Decision;
  hits: FilterHit[];
  primary: FilterHit | null;
  deleteMessage: boolean;
  warnUser: boolean;
  notifyAdmins: boolean;
  hardAction: ModerationAction | null;
  skippedReason?: string;
}

export interface InspectionContext {
  message: IncomingMessage;
  settings: import('./models.js').ChatSettings;
  now: number;
}
