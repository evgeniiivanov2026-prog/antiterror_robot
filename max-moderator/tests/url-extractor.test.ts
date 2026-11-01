import { describe, expect, it } from 'vitest';
import { parseIncoming } from '../src/bot/parse-update.js';
import { hostMatches, parseLink } from '../src/utils/url-extractor.js';

describe('url extractor', () => {
  it('reads urls from text, buttons and shares, and ignores media CDN urls', () => {
    const message = parseIncoming({
      message: {
        timestamp: 1,
        recipient: { chat_id: 7, chat_type: 'chat' },
        sender: { user_id: 9, is_bot: false },
        body: {
          mid: 'mid-1',
          text: 'смотри https://good.example/a',
          attachments: [
            { type: 'image', payload: { url: 'https://cdn.max.ru/photo.jpg', token: 't' } },
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'link', text: 'сайт', url: 'https://bad.example/x' }]],
              },
            },
            { type: 'share', payload: { url: 'https://shop.example/item' } },
          ],
        },
      },
    });
    expect(message?.links.map((link) => link.host).sort()).toEqual([
      'bad.example',
      'good.example',
      'shop.example',
    ]);
  });

  it('normalizes punycode and matches subdomains', () => {
    const link = parseLink('https://xn--e1afmapc.xn--p1ai/path');
    expect(link?.host).toBe('xn--e1afmapc.xn--p1ai');
    expect(hostMatches('a.evil.example', 'evil.example')).toBe(true);
    expect(hostMatches('notevil.example', 'evil.example')).toBe(false);
  });

  it('rejects an update without a sender or message id', () => {
    expect(parseIncoming({ message: { body: { text: 'x' } } })).toBeNull();
  });
});
