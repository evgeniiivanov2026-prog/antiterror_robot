import { z } from 'zod';
import type { IncomingMessage } from '../domain/messages.js';
import { countMentions } from '../utils/text-normalizer.js';
import { extractUrlsFromText } from '../utils/url-extractor.js';

const attachmentSchema = z
  .object({
    type: z.string(),
    payload: z.unknown().optional(),
    url: z.string().optional(),
  })
  .passthrough();

const messageCreatedSchema = z.object({
  update_type: z.literal('message_created'),
  timestamp: z.number(),
  message: z.object({
    sender: z
      .object({
        user_id: z.number(),
        is_bot: z.boolean().optional(),
      })
      .nullable()
      .optional(),
    recipient: z.object({
      chat_id: z.number().nullable(),
      chat_type: z.enum(['dialog', 'chat', 'channel']),
    }),
    timestamp: z.number().optional(),
    link: z
      .object({
        type: z.enum(['forward', 'reply']),
      })
      .nullable()
      .optional(),
    body: z.object({
      mid: z.string().min(1).max(256),
      text: z.string().max(20_000).nullable().optional(),
      attachments: z.array(attachmentSchema).max(50).nullable().optional(),
    }),
  }),
});

const botAddedSchema = z.object({
  update_type: z.literal('bot_added'),
  chat_id: z.number(),
  timestamp: z.number().optional(),
});

export function parseMessageCreated(update: unknown): IncomingMessage | null {
  const parsed = messageCreatedSchema.safeParse(update);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  const chatId = message.recipient.chat_id;
  const userId = message.sender?.user_id;
  if (chatId === null || userId === undefined) return null;
  const text = message.body.text ?? '';
  const urls = collectUrls(text, message.body.attachments ?? []);
  const hasMedia = (message.body.attachments ?? []).some((attachment) =>
    ['image', 'video', 'audio', 'file'].includes(attachment.type),
  );
  return {
    chatId: String(chatId),
    chatType: message.recipient.chat_type,
    userId: String(userId),
    isBot: message.sender?.is_bot ?? false,
    messageId: message.body.mid,
    text,
    urls,
    hasMedia,
    isForward: message.link?.type === 'forward',
    mentionCount: countMentions(text),
    timestamp: message.timestamp ?? parsed.data.timestamp,
  };
}

export function parseBotAdded(update: unknown): { chatId: string } | null {
  const parsed = botAddedSchema.safeParse(update);
  if (!parsed.success) return null;
  return { chatId: String(parsed.data.chat_id) };
}

function collectUrls(text: string, attachments: z.infer<typeof attachmentSchema>[]): string[] {
  const urls = new Set(extractUrlsFromText(text));
  for (const attachment of attachments) {
    const payload = attachment.payload;
    if (!payload || typeof payload !== 'object') continue;
    if (attachment.type === 'share') {
      const shareUrl = readString(payload, 'url');
      if (shareUrl) urls.add(shareUrl);
    }
    if (attachment.type === 'inline_keyboard') {
      const buttons = (payload as { buttons?: unknown }).buttons;
      if (!Array.isArray(buttons)) continue;
      for (const row of buttons) {
        if (!Array.isArray(row)) continue;
        for (const button of row) {
          if (!button || typeof button !== 'object') continue;
          const url = readString(button, 'url');
          if (url) urls.add(url);
        }
      }
    }
  }
  return [...urls];
}

function readString(value: object, key: string): string | undefined {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0 && candidate.length < 2000
    ? candidate
    : undefined;
}
