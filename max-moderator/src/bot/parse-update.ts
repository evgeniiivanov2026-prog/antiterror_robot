import type { IncomingLink, IncomingMessage } from '../domain/types.js';
import { extractUrls, type RawUrlParts } from '../utils/url-extractor.js';

const MEDIA = new Set(['image', 'video', 'audio', 'file', 'sticker']);

export function parseIncoming(update: { message?: unknown }): IncomingMessage | null {
  const message = asRecord(update.message);
  if (!message) return null;
  const body = asRecord(message.body);
  const recipient = asRecord(message.recipient);
  const sender = asRecord(message.sender);
  const messageId = typeof body?.mid === 'string' ? body.mid : '';
  const chatId = idString(recipient?.chat_id, true);
  const userId = idString(sender?.user_id, false);
  if (!messageId || !chatId || !userId) return null;
  const text = typeof body?.text === 'string' ? body.text.slice(0, 8000) : '';
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const markup = Array.isArray(body?.markup) ? body.markup : [];
  const parts = collectParts(text, attachments, markup);
  const link = asRecord(message.link);
  return {
    messageId,
    chatId,
    chatType: typeof recipient?.chat_type === 'string' ? recipient.chat_type : '',
    userId,
    isBot: sender?.is_bot === true,
    text,
    links: parts.links,
    mentionCount: parts.mentionCount,
    mediaTypes: parts.mediaTypes,
    isForward: link?.type === 'forward',
    timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
  };
}

function collectParts(
  text: string,
  attachments: unknown[],
  markup: unknown[],
): { links: IncomingLink[]; mentionCount: number; mediaTypes: string[] } {
  const buttonUrls: string[] = [];
  const shareUrls: string[] = [];
  const markupUrls: string[] = [];
  const mediaTypes: string[] = [];
  const mentions = new Set<string>();
  for (const item of attachments) {
    const attachment = asRecord(item);
    if (!attachment || typeof attachment.type !== 'string') continue;
    if (MEDIA.has(attachment.type)) mediaTypes.push(attachment.type);
    if (attachment.type === 'share') {
      const payload = asRecord(attachment.payload);
      if (typeof payload?.url === 'string') shareUrls.push(payload.url);
    }
    if (attachment.type === 'inline_keyboard') {
      const payload = asRecord(attachment.payload);
      const rows = Array.isArray(payload?.buttons) ? payload.buttons : [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const button of row) {
          const record = asRecord(button);
          if (record?.type === 'link' && typeof record.url === 'string')
            buttonUrls.push(record.url);
        }
      }
    }
  }
  for (const item of markup) {
    const record = asRecord(item);
    if (!record || typeof record.type !== 'string') continue;
    if (record.type === 'user_mention') {
      const id = record.user_id ?? record.user_link;
      if (typeof id === 'string' || typeof id === 'number') mentions.add(String(id));
    }
    if (record.type === 'link' && typeof record.url === 'string') markupUrls.push(record.url);
  }
  for (const match of text.matchAll(/(?:^|\s)@([a-z0-9_.]{3,})/giu)) {
    const name = match[1];
    if (name) mentions.add(`@${name.toLowerCase()}`);
  }
  for (const match of text.matchAll(/max:\/\/user\/(\d+)/g)) {
    const id = match[1];
    if (id) mentions.add(id);
  }
  const raw: RawUrlParts = { text, buttonUrls, shareUrls, markupUrls };
  return { links: extractUrls(raw), mentionCount: mentions.size, mediaTypes };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function idString(value: unknown, allowNegative: boolean): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (!allowNegative && value <= 0) return null;
  if (allowNegative && value === 0) return null;
  return String(value);
}
