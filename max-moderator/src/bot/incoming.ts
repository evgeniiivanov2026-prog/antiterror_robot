import { z } from 'zod';

const attachmentSchema = z
  .object({
    type: z.string(),
    payload: z.record(z.unknown()).optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    sender: z
      .object({
        user_id: z.number(),
        is_bot: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    recipient: z
      .object({
        chat_id: z.number().nullable().optional(),
        chat_type: z.enum(['dialog', 'chat', 'channel']).optional(),
      })
      .passthrough(),
    link: z
      .object({
        type: z.enum(['forward', 'reply']).optional(),
        message: z
          .object({
            text: z.string().nullable().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    body: z
      .object({
        mid: z.string().min(1),
        text: z.string().nullable().optional(),
        attachments: z.array(attachmentSchema).nullable().optional(),
        markup: z.array(z.record(z.unknown())).nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const updateSchema = z
  .object({
    update_type: z.enum(['message_created', 'message_edited']),
    timestamp: z.number().optional(),
    message: messageSchema,
  })
  .passthrough();

export interface IncomingCommand {
  name: string;
  rest: string;
}

export interface IncomingMessage {
  updateType: 'message_created' | 'message_edited';
  eventKey: string;
  chatId: string;
  chatType: 'dialog' | 'chat' | 'channel';
  userId: string;
  isBot: boolean;
  messageId: string;
  text: string;
  scannedText: string;
  buttonUrls: string[];
  shareUrls: string[];
  hasMedia: boolean;
  isForward: boolean;
  mentionCount: number;
  command: IncomingCommand | null;
  timestamp: number;
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'file', 'sticker']);
const MENTION_PATTERN = /(^|[^\p{L}\p{N}_])@[\p{L}\p{N}_.]{2,}/gu;

export function parseCommand(text: string): IncomingCommand | null {
  const match = /^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match?.[1]) return null;
  return { name: match[1].toLowerCase(), rest: (match[2] ?? '').trim() };
}

export function splitArgs(input: string): string[] {
  const args: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  for (const match of input.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    args.push(value.replace(/\\(["'\\])/g, '$1'));
  }
  return args;
}

export function parseIncoming(update: unknown): IncomingMessage | null {
  const parsed = updateSchema.safeParse(update);
  if (!parsed.success || !parsed.data.message.sender) return null;
  const message = parsed.data.message;
  const sender = message.sender;
  if (!sender) return null;
  const chatType = message.recipient.chat_type ?? (message.recipient.chat_id ? 'chat' : 'dialog');
  const chatId =
    message.recipient.chat_id !== undefined && message.recipient.chat_id !== null
      ? String(message.recipient.chat_id)
      : `dialog:${sender.user_id}`;
  const text = message.body.text ?? '';
  const forwarded = message.link?.type === 'forward' ? (message.link.message?.text ?? '') : '';
  const attachments = message.body.attachments ?? [];
  const buttonUrls: string[] = [];
  const shareUrls: string[] = [];
  let hasMedia = false;
  for (const attachment of attachments) {
    if (MEDIA_TYPES.has(attachment.type)) hasMedia = true;
    if (attachment.type === 'share') {
      const url = attachment.payload?.url;
      if (typeof url === 'string') shareUrls.push(url);
    }
    if (attachment.type === 'inline_keyboard') {
      const buttons = attachment.payload?.buttons;
      if (!Array.isArray(buttons)) continue;
      for (const row of buttons) {
        if (!Array.isArray(row)) continue;
        for (const button of row) {
          if (!button || typeof button !== 'object') continue;
          const candidate = button as { type?: unknown; url?: unknown };
          if (candidate.type === 'link' && typeof candidate.url === 'string')
            buttonUrls.push(candidate.url);
        }
      }
    }
  }
  const markup = message.body.markup ?? [];
  let mentionCount = [...text.matchAll(MENTION_PATTERN)].length;
  for (const item of markup) {
    if (item.type === 'user_mention') mentionCount += 1;
  }
  const timestamp = parsed.data.timestamp ?? 0;
  return {
    updateType: parsed.data.update_type,
    eventKey: `${parsed.data.update_type}:${chatId}:${message.body.mid}:${timestamp}`,
    chatId,
    chatType,
    userId: String(sender.user_id),
    isBot: Boolean(sender.is_bot),
    messageId: message.body.mid,
    text,
    scannedText: [text, forwarded].filter((part) => part.length > 0).join('\n'),
    buttonUrls,
    shareUrls,
    hasMedia,
    isForward: message.link?.type === 'forward',
    mentionCount,
    command: parseCommand(text),
    timestamp,
  };
}
