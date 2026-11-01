import { describe, expect, it } from 'vitest';
import { handleIncoming } from '../src/bot/handlers/message.handler.js';
import { defaultChatSettings } from '../src/config/env.js';
import { LinkList, LinkMode, ModerationAction, RuleType, Severity } from '../src/domain/enums.js';
import { buildHarness, MaxApiError, message, testConfig } from './harness.js';

async function seedWord(
  app: ReturnType<typeof buildHarness>,
  pattern: string,
  patch?: { type?: RuleType; action?: ModerationAction; severity?: Severity },
) {
  await app.repos.filters.create({
    chatId: '100',
    type: patch?.type ?? RuleType.WORD,
    pattern,
    action: patch?.action ?? ModerationAction.DELETE,
    severity: patch?.severity ?? Severity.LOW,
    enabled: true,
    createdBy: '1',
  });
}

describe('moderation pipeline', () => {
  it('deletes a message that matches a word filter and writes an audit record', async () => {
    const app = buildHarness();
    await seedWord(app, 'куплю базу данных');
    const result = await app.pipeline.handle(message({ text: 'Куплю базу данных сегодня' }));
    expect(result.decision).toBe('ACT');
    expect(app.max.deleted).toEqual(['m1']);
    expect(app.max.users).toEqual([]);
    const audit = await app.repos.audit.listRecent('100', 10);
    expect(audit.some((row) => row.action === 'delete')).toBe(true);
    const violations = await app.repos.violations.listByUser('100', '42', 10);
    expect(violations).toHaveLength(1);
  });

  it('matches a regex filter', async () => {
    const app = buildHarness();
    await seedWord(app, '\\b(spam|scam)\\b', { type: RuleType.REGEX, severity: Severity.HIGH });
    const result = await app.pipeline.handle(message({ text: 'this is spam' }));
    expect(result.decision).toBe('ACT');
    expect(app.max.deleted).toEqual(['m1']);
    const audit = await app.repos.audit.listRecent('100', 10);
    expect(audit.some((row) => row.action === 'delete')).toBe(true);
  });

  it('does not moderate a whitelisted user', async () => {
    const app = buildHarness();
    await seedWord(app, 'база');
    await app.repos.whitelist.add({
      chatId: '100',
      userId: '42',
      reason: 'trusted',
      createdBy: '1',
    });
    const result = await app.pipeline.handle(message({ text: 'база клиентов' }));
    expect(result).toMatchObject({ decision: 'ALLOW', reason: 'whitelist' });
    expect(app.max.deleted).toEqual([]);
    expect(await app.repos.violations.listByUser('100', '42', 10)).toEqual([]);
  });

  it('does not moderate a chat admin', async () => {
    const app = buildHarness();
    app.max.admins = [
      { userId: '42', isAdmin: true, isOwner: false, isBot: false, permissions: ['write'] },
    ];
    await seedWord(app, 'база');
    const result = await app.pipeline.handle(message({ text: 'база' }));
    expect(result.reason).toBe('chat_admin');
    expect(app.max.deleted).toEqual([]);
  });

  it('deletes a blacklisted link and allows a whitelisted link in deny mode', async () => {
    const app = buildHarness();
    await app.repos.settings.save({
      ...defaultChatSettings('100', testConfig()),
      linkMode: LinkMode.ALLOW,
    });
    await app.repos.links.upsert({
      chatId: '100',
      domain: 'bad.example',
      list: LinkList.DENY,
      action: ModerationAction.DELETE,
      note: '',
    });
    const blocked = await app.pipeline.handle(
      message({
        messageId: 'b1',
        text: 'https://bad.example/deal',
        links: [
          {
            raw: 'https://bad.example/deal',
            host: 'bad.example',
            isIp: false,
            isShortener: false,
            suspicious: false,
          },
        ],
      }),
    );
    expect(blocked.decision).toBe('ACT');
    expect(app.max.deleted).toContain('b1');

    await app.cache.invalidate('100');
    await app.repos.settings.save({
      ...defaultChatSettings('100', testConfig()),
      linkMode: LinkMode.DENY,
    });
    await app.repos.links.upsert({
      chatId: '100',
      domain: 'good.example',
      list: LinkList.ALLOW,
      action: ModerationAction.DELETE,
      note: '',
    });
    const allowed = await app.pipeline.handle(
      message({
        messageId: 'g1',
        text: 'https://good.example/docs',
        links: [
          {
            raw: 'https://good.example/docs',
            host: 'good.example',
            isIp: false,
            isShortener: false,
            suspicious: false,
          },
        ],
      }),
    );
    expect(allowed.decision).toBe('ALLOW');
    const denied = await app.pipeline.handle(
      message({
        messageId: 'o1',
        text: 'https://other.example/docs',
        links: [
          {
            raw: 'https://other.example/docs',
            host: 'other.example',
            isIp: false,
            isShortener: false,
            suspicious: false,
          },
        ],
      }),
    );
    expect(denied.decision).toBe('ACT');
    expect(app.max.deleted).toContain('o1');
  });

  it('detects flood inside the sliding window', async () => {
    const app = buildHarness();
    await app.repos.settings.save({
      ...defaultChatSettings('100', testConfig()),
      floodMaxMessages: 3,
      floodWindowSec: 10,
      capsEnabled: false,
    });
    await app.pipeline.handle(message({ messageId: 'f1', text: 'one message here' }));
    await app.pipeline.handle(message({ messageId: 'f2', text: 'two message here' }));
    const third = await app.pipeline.handle(
      message({ messageId: 'f3', text: 'three message here' }),
    );
    expect(third.reason).toContain('flood');
    const violations = await app.repos.violations.listByUser('100', '42', 10);
    expect(violations.map((item) => item.violationType)).toContain(RuleType.FLOOD);
  });

  it('keeps going when the MAX delete call fails', async () => {
    const app = buildHarness();
    app.max.deleteError = new MaxApiError(500, 'upstream');
    await seedWord(app, 'база');
    await expect(app.pipeline.handle(message({ text: 'база' }))).resolves.toMatchObject({
      decision: 'ACT',
    });
    const audit = await app.repos.audit.listRecent('100', 10);
    expect(audit.some((row) => row.action === 'delete_failed')).toBe(true);
  });

  it('does not create a duplicate violation for the same event', async () => {
    const app = buildHarness();
    await seedWord(app, 'база');
    const payload = message({ text: 'база' });
    await app.pipeline.handle(payload);
    const second = await app.pipeline.handle(payload);
    expect(second.decision).toBe('DUPLICATE');
    expect(app.max.deleted).toEqual(['m1']);
    expect(await app.repos.violations.listByUser('100', '42', 10)).toHaveLength(1);
  });

  it('skips a broken regex and still applies the word filter', async () => {
    const app = buildHarness();
    await seedWord(app, '(a+)+', { type: RuleType.REGEX });
    await seedWord(app, 'запрет');
    const result = await app.pipeline.handle(message({ text: 'это запрет' }));
    expect(result.decision).toBe('ACT');
    expect(app.max.deleted).toEqual(['m1']);
  });

  it('does not throw when the admin lookup fails', async () => {
    const app = buildHarness();
    app.max.adminError = new MaxApiError(503, 'unavailable');
    await seedWord(app, 'база');
    await expect(app.pipeline.handle(message({ text: 'база' }))).resolves.toMatchObject({
      decision: 'ALLOW',
      reason: 'permissions_unknown',
    });
    expect(app.max.deleted).toEqual([]);
  });
});

describe('admin commands', () => {
  it('lets an admin add and remove a filter and rejects a regular user', async () => {
    const app = buildHarness();
    app.max.admins = [
      { userId: '7', isAdmin: true, isOwner: false, isBot: false, permissions: ['write'] },
    ];
    const adminMessage = message({ userId: '7', text: '/filter add "база данных"' });
    const added = await app.admin.handle(adminMessage);
    expect(added[0]).toContain('добавлен');
    const listed = await app.repos.filters.list('100');
    expect(listed).toHaveLength(1);
    const id = listed[0]?.id;
    const removed = await app.admin.handle(message({ userId: '7', text: `/filter remove ${id}` }));
    expect(removed[0]).toContain('удалён');
    expect(await app.repos.filters.list('100')).toHaveLength(0);

    const denied = await app.admin.handle(message({ userId: '42', text: '/filter add база' }));
    expect(denied[0]).toContain('Недостаточно прав');
    expect(await app.repos.filters.list('100')).toHaveLength(0);
  });

  it('answers /help in a group and does not moderate the command itself', async () => {
    const app = buildHarness();
    await handleIncoming(message({ text: '/help' }), {
      pipeline: app.pipeline,
      admin: app.admin,
      max: app.max,
    });
    expect(app.max.chats[0]).toContain('/filter add');
    expect(app.max.deleted).toEqual([]);
  });
});
