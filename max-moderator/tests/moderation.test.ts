import { describe, expect, it } from 'vitest';
import { FilterType, ModerationAction } from '../src/moderation/types.js';
import { Severity } from '../src/moderation/severity.js';
import { WordFilterService } from '../src/moderation/word-filter.service.js';
import { MaxApiError } from '../src/max/errors.js';
import type { WordFilter } from '../src/moderation/types.js';
import { createTestApp, groupMessage } from './helpers.js';

function rule(patch: Partial<WordFilter> & Pick<WordFilter, 'pattern' | 'wholeWord'>): WordFilter {
  const now = new Date();
  return {
    id: 1,
    chatId: '100',
    type: FilterType.WORD,
    action: ModerationAction.DELETE,
    severity: Severity.LOW,
    enabled: true,
    createdBy: '1',
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe('word filter matching', () => {
  const service = new WordFilterService();

  it('matches a banned word and obfuscated spellings, but not a longer word', () => {
    const banned = rule({ pattern: 'слово', wholeWord: true });
    expect(service.match('тут слово есть', [banned])).toHaveLength(1);
    expect(service.match('это с*лово', [banned])).toHaveLength(1);
    expect(service.match('с л о в о', [banned])).toHaveLength(1);
    expect(service.match('сл0во', [banned])).toHaveLength(1);
    expect(service.match('cл0в0', [banned])).toHaveLength(1);
    expect(service.match('ссслово', [banned])).toHaveLength(1);
    expect(service.match('словоохотливый', [banned])).toHaveLength(0);
    expect(
      service.match('словоохотливый', [rule({ pattern: 'слово', wholeWord: false })]),
    ).toHaveLength(1);
  });

  it('matches a safe regex', () => {
    const regex = rule({
      type: FilterType.REGEX,
      pattern: String.raw`\b(spam|scam)\b`,
      wholeWord: false,
    });
    expect(service.match('this is spam', [regex])).toHaveLength(1);
    expect(service.match('ordinary text', [regex])).toHaveLength(0);
  });
});

describe('moderation pipeline', () => {
  it('deletes a message that matches a word filter and writes an audit record', async () => {
    const { app, max, repositories } = createTestApp();
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/filter add слово' }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '2', messageId: 'm1', text: 'здесь слово', timestamp: 2 }),
    );

    expect(max.deleted).toEqual(['m1']);
    const violations = await repositories.violations.listByUser('100', '2', 10);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.violationType).toBe('WORD');
    const audit = await repositories.audit.listRecent('100', 20);
    expect(audit.some((entry) => entry.action === 'delete' && entry.targetUserId === '2')).toBe(
      true,
    );
  });

  it('triggers a regex filter', async () => {
    const { app, max } = createTestApp();
    await app.handleUpdate(
      groupMessage({
        userId: '1',
        messageId: 'a1',
        text: String.raw`/filter regex "\b(spam|scam)\b"`,
      }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '2', messageId: 'm1', text: 'this is spam', timestamp: 2 }),
    );
    expect(max.deleted).toEqual(['m1']);
  });

  it('does not moderate a whitelisted user', async () => {
    const { app, max } = createTestApp();
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/filter add слово' }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a2', text: '/whitelist add 2', timestamp: 2 }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '2', messageId: 'm1', text: 'слово', timestamp: 3 }),
    );
    expect(max.deleted).toEqual([]);
  });

  it('lets an admin add and remove a filter', async () => {
    const { app, max, repositories } = createTestApp();
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/filter add "плохая фраза"' }),
    );
    const filters = await repositories.filters.list('100');
    expect(filters).toHaveLength(1);
    await app.handleUpdate(
      groupMessage({ userId: '2', messageId: 'm1', text: 'это плохая фраза', timestamp: 2 }),
    );
    expect(max.deleted).toEqual(['m1']);
    await app.handleUpdate(
      groupMessage({
        userId: '1',
        messageId: 'a2',
        text: `/filter remove ${filters[0]?.id}`,
        timestamp: 3,
      }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '2', messageId: 'm2', text: 'снова плохая фраза', timestamp: 4 }),
    );
    expect(max.deleted).toEqual(['m1']);
    expect(await repositories.filters.list('100')).toHaveLength(0);
  });

  it('deletes a blacklisted link and allows a whitelisted link', async () => {
    const { app, max } = createTestApp();
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/links mode deny' }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a2', text: '/links add evil.com', timestamp: 2 }),
    );
    await app.handleUpdate(
      groupMessage({
        userId: '1',
        messageId: 'a3',
        text: '/links add safe.com allow',
        timestamp: 3,
      }),
    );
    await app.handleUpdate(
      groupMessage({
        userId: '2',
        messageId: 'm1',
        text: 'смотри https://evil.com/deal',
        timestamp: 4,
      }),
    );
    await app.handleUpdate(
      groupMessage({
        userId: '2',
        messageId: 'm2',
        text: 'нормально https://safe.com/docs',
        timestamp: 5,
      }),
    );
    expect(max.deleted).toEqual(['m1']);
  });

  it('detects flood in a sliding window', async () => {
    const { app, repositories } = createTestApp();
    for (let index = 0; index < 6; index += 1) {
      await app.handleUpdate(
        groupMessage({
          userId: '2',
          messageId: `f${index}`,
          text: `сообщение ${index}`,
          timestamp: index + 1,
        }),
      );
    }
    const violations = await repositories.violations.listByUser('100', '2', 10);
    expect(violations.some((item) => item.violationType === 'FLOOD')).toBe(true);
  });

  it('keeps processing after a MAX API error and audits the attempt', async () => {
    const { app, max, repositories } = createTestApp();
    let calls = 0;
    max.deleteMessage = async (messageId: string) => {
      calls += 1;
      if (calls === 1) throw new MaxApiError(500, 'temporary outage', true);
      max.deleted.push(messageId);
    };
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/filter add слово' }),
    );
    await expect(
      app.handleUpdate(groupMessage({ userId: '2', messageId: 'm1', text: 'слово', timestamp: 2 })),
    ).resolves.toBeUndefined();
    await expect(
      app.handleUpdate(
        groupMessage({ userId: '2', messageId: 'm2', text: 'ещё слово', timestamp: 3 }),
      ),
    ).resolves.toBeUndefined();
    expect(max.deleted).toEqual(['m2']);
    const audit = await repositories.audit.listRecent('100', 20);
    expect(audit.filter((entry) => entry.action === 'delete')).toHaveLength(2);
    expect(audit.find((entry) => entry.metadata.messageId === 'm1')?.metadata.deleteOk).toBe(false);
  });

  it('does not create a duplicate violation for a repeated event', async () => {
    const { app, max, repositories } = createTestApp();
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/filter add слово' }),
    );
    const update = groupMessage({ userId: '2', messageId: 'm1', text: 'слово', timestamp: 2 });
    await app.handleUpdate(update);
    await app.handleUpdate(update);
    expect(max.deleted).toEqual(['m1']);
    expect(await repositories.violations.listByUser('100', '2', 10)).toHaveLength(1);
    expect(
      (await repositories.audit.listRecent('100', 20)).filter((entry) => entry.action === 'delete'),
    ).toHaveLength(1);
  });

  it('does not moderate an admin', async () => {
    const { app, max } = createTestApp();
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a1', text: '/filter add слово' }),
    );
    await app.handleUpdate(
      groupMessage({ userId: '1', messageId: 'a2', text: 'слово от админа', timestamp: 2 }),
    );
    expect(max.deleted).toEqual([]);
  });
});
