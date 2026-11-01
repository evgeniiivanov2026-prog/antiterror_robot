import { describe, expect, it } from 'vitest';
import { createTestHarness } from '../src/app.js';
import { defaultChatSettings } from '../src/config/defaults.js';
import type { AppConfig } from '../src/config/env.js';
import {
  Decision,
  LinkList,
  LinkMode,
  ModerationAction,
  RuleType,
  Severity,
} from '../src/domain/enums.js';
import type { IncomingMessage } from '../src/domain/messages.js';
import { FakeMaxGateway } from '../src/max/gateway.js';
import { QueuedMessageRemover } from '../src/max/message-remover.js';
import { SlidingWindowRateLimiter, type Clock } from '../src/max/rate-limiter.js';
import { LinkFilterService } from '../src/moderation/link-filter.service.js';
import { WordFilterService } from '../src/moderation/word-filter.service.js';
import { compileUserRegex } from '../src/utils/safe-regex.js';
import { matchesPattern } from '../src/utils/text-normalizer.js';
import { silentLogger } from '../src/utils/logger.js';
import { parseMessageCreated } from '../src/bot/update.js';

function testConfig(adminIds: string[] = []): AppConfig {
  return {
    token: 'test-token',
    databaseUrl: 'postgresql://localhost/test',
    redisUrl: 'redis://localhost',
    nodeEnv: 'test',
    logLevel: 'silent',
    adminIds: new Set(adminIds),
    defaultLinkMode: LinkMode.REVIEW,
    defaultWordAction: ModerationAction.DELETE,
    maxDeletionsPerSecond: 2,
    apiBaseUrl: 'https://platform-api2.max.ru',
    botMode: 'polling',
    webhookPort: 8088,
    webhookPath: '/webhook',
    webhookSecret: '',
    webhookDomain: '',
  };
}

function message(patch: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    chatId: '1',
    chatType: 'chat',
    userId: '42',
    isBot: false,
    messageId: 'm1',
    text: 'обычное сообщение',
    urls: [],
    hasMedia: false,
    isForward: false,
    mentionCount: 0,
    timestamp: 1_700_000_000_000,
    ...patch,
  };
}

async function harness(adminIds: string[] = []) {
  const gateway = new FakeMaxGateway();
  const logger = silentLogger();
  const config = testConfig(adminIds);
  const app = createTestHarness(config, gateway, logger);
  const settings = defaultChatSettings('1', {
    linkMode: LinkMode.REVIEW,
    wordAction: ModerationAction.DELETE,
  });
  settings.lexiconSeeded = true;
  await app.repos.settings.save(settings);
  const words = new WordFilterService(app.repos.filters, app.cache);
  const links = new LinkFilterService(app.repos.links, app.cache);
  return { ...app, gateway, words, links, settings };
}

describe('word and regex filters', () => {
  it('matches obfuscated words and keeps whole words intact', () => {
    expect(matchesPattern('тут сово', 'сово', true)).toBe(true);
    expect(matchesPattern('с*ово', 'сово', true)).toBe(true);
    expect(matchesPattern('с о в о', 'сово', true)).toBe(true);
    expect(matchesPattern('с0в0', 'сово', true)).toBe(true);
    expect(matchesPattern('ссоово', 'сово', true)).toBe(true);
    expect(matchesPattern(`c${'ово'}`, 'сово', true)).toBe(true);
    expect(matchesPattern('совок', 'сово', true)).toBe(false);
    expect(matchesPattern('совок', 'сово', false)).toBe(true);
    expect(matchesPattern('я куплю базу данных завтра', 'куплю базу данных', true)).toBe(true);
  });

  it('deletes a message that matches a word filter and writes an audit record', async () => {
    const app = await harness();
    await app.words.add({
      chatId: '1',
      type: RuleType.WORD,
      pattern: 'сово',
      action: ModerationAction.DELETE,
      severity: Severity.LOW,
      wholeWord: true,
      createdBy: '7',
    });

    const decision = await app.pipeline.handle(message({ text: 'тут с*ово', messageId: 'bad-1' }));
    await app.remover.drain();

    expect(decision.decision).toBe(Decision.DELETE);
    expect(decision.deleteMessage).toBe(true);
    expect(app.gateway.deleted).toEqual(['bad-1']);
    const audits = await app.repos.audit.listRecent('1', 20);
    expect(audits.some((row) => row.action === 'DELETE')).toBe(true);
    expect(audits.some((row) => row.action === 'message_deleted')).toBe(true);
    expect(JSON.stringify(audits)).not.toContain('тут с*ово');
  });

  it('does not delete a longer allowed word when wholeWord is on', async () => {
    const app = await harness();
    await app.words.add({
      chatId: '1',
      type: RuleType.WORD,
      pattern: 'сово',
      action: ModerationAction.DELETE,
      severity: Severity.LOW,
      wholeWord: true,
      createdBy: '7',
    });
    const decision = await app.pipeline.handle(
      message({ text: 'совок на складе', messageId: 'ok-1' }),
    );
    expect(decision.decision).toBe(Decision.ALLOW);
    expect(app.gateway.deleted).toEqual([]);
  });

  it('flags a regex filter', async () => {
    const app = await harness();
    await app.words.add({
      chatId: '1',
      type: RuleType.REGEX,
      pattern: String.raw`\b(spam|scam)\b`,
      action: ModerationAction.DELETE,
      severity: Severity.LOW,
      wholeWord: false,
      createdBy: '7',
    });
    const decision = await app.pipeline.handle(
      message({ text: 'this is spam mail', messageId: 'rx-1' }),
    );
    await app.remover.drain();
    expect(decision.decision).toBe(Decision.DELETE);
    expect(app.gateway.deleted).toEqual(['rx-1']);
  });

  it('rejects a dangerous regex', () => {
    expect(() => compileUserRegex('(a+)+')).toThrow(/ReDoS/);
  });
});

describe('permissions and idempotency', () => {
  it('does not moderate a whitelisted user', async () => {
    const app = await harness();
    await app.words.add({
      chatId: '1',
      type: RuleType.WORD,
      pattern: 'сово',
      action: ModerationAction.DELETE,
      severity: Severity.HIGH,
      wholeWord: true,
      createdBy: '7',
    });
    await app.repos.whitelist.add({ chatId: '1', userId: '42', reason: 'staff', createdBy: '7' });
    const decision = await app.pipeline.handle(message({ text: 'сово' }));
    expect(decision.skippedReason).toBe('whitelist');
    expect(await app.repos.violations.countByUser('1', '42')).toBe(0);
    expect(app.gateway.deleted).toEqual([]);
  });

  it('does not moderate a chat admin', async () => {
    const app = await harness();
    app.gateway.members = [
      { userId: '42', isOwner: false, isAdmin: true, isBot: false, permissions: ['write'] },
    ];
    await app.words.add({
      chatId: '1',
      type: RuleType.WORD,
      pattern: 'сово',
      action: ModerationAction.DELETE,
      severity: Severity.HIGH,
      wholeWord: true,
      createdBy: '1',
    });
    const decision = await app.pipeline.handle(message({ text: 'сово' }));
    expect(decision.skippedReason).toBe('privileged');
    expect(app.gateway.deleted).toEqual([]);
  });

  it('lets an admin add and remove a filter', async () => {
    const app = await harness(['7']);
    const added = await app.commands.execute(
      message({ userId: '7', messageId: 'cmd-1', text: '/filter add "плохая фраза"' }),
    );
    expect(added).toMatch(/Фильтр \d+ добавлен/);
    const id = /Фильтр (\d+)/.exec(added ?? '')?.[1];
    expect(id).toBeTruthy();
    const removed = await app.commands.execute(
      message({ userId: '7', messageId: 'cmd-2', text: `/filter remove ${id}` }),
    );
    expect(removed).toMatch(/удалён/);
    const rows = await app.repos.filters.list('1');
    expect(rows.some((row) => row.pattern === 'плохая фраза')).toBe(false);
  });

  it('refuses filter commands from a regular member', async () => {
    const app = await harness();
    const reply = await app.commands.execute(message({ text: '/filter add сово' }));
    expect(reply).toMatch(/Недостаточно прав/);
    expect(await app.repos.filters.list('1')).toEqual([]);
  });

  it('does not create a second violation for a repeated event', async () => {
    const app = await harness();
    await app.words.add({
      chatId: '1',
      type: RuleType.WORD,
      pattern: 'сово',
      action: ModerationAction.DELETE,
      severity: Severity.LOW,
      wholeWord: true,
      createdBy: '7',
    });
    const first = await app.pipeline.handle(message({ text: 'сово', messageId: 'same' }));
    const second = await app.pipeline.handle(message({ text: 'сово', messageId: 'same' }));
    await app.remover.drain();
    expect(first.decision).toBe(Decision.DELETE);
    expect(second.skippedReason).toBe('duplicate');
    expect(await app.repos.violations.countByUser('1', '42')).toBe(1);
    expect(app.gateway.deleted).toEqual(['same']);
  });

  it('keeps going when the MAX API delete fails', async () => {
    const app = await harness();
    app.gateway.failDelete = true;
    await app.words.add({
      chatId: '1',
      type: RuleType.WORD,
      pattern: 'сово',
      action: ModerationAction.DELETE,
      severity: Severity.LOW,
      wholeWord: true,
      createdBy: '7',
    });
    await expect(
      app.pipeline.handle(message({ text: 'сово', messageId: 'err-1' })),
    ).resolves.toMatchObject({
      decision: Decision.DELETE,
    });
    await app.remover.drain();
    const audits = await app.repos.audit.listRecent('1', 10);
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(['DELETE', 'delete_failed']),
    );
  });

  it('isolates a failing filter and still applies the others', async () => {
    const gateway = new FakeMaxGateway();
    const app = createTestHarness(testConfig(), gateway, silentLogger(), [
      {
        name: 'boom',
        inspect: async () => {
          throw new Error('boom');
        },
      },
    ]);
    const settings = defaultChatSettings('1', {
      linkMode: LinkMode.DENY,
      wordAction: ModerationAction.DELETE,
    });
    settings.lexiconSeeded = true;
    await app.repos.settings.save(settings);
    const decision = await app.pipeline.handle(
      message({ text: 'смотри', urls: ['https://unknown.test/a'], messageId: 'iso-1' }),
    );
    expect(decision.decision).toBe(Decision.DELETE);
    expect(decision.primary?.type).toBe(RuleType.LINK_DOMAIN);
  });
});

describe('links and spam', () => {
  it('deletes a blacklisted link and allows a whitelisted one', async () => {
    const app = await harness();
    app.settings.linkMode = LinkMode.DENY;
    await app.repos.settings.save(app.settings);
    await app.links.add('1', 'evil.test', LinkList.BLACKLIST, ModerationAction.DELETE);
    await app.links.add('1', 'safe.test', LinkList.WHITELIST, ModerationAction.DELETE);

    const blocked = await app.pipeline.handle(
      message({ text: 'ссылка', urls: ['https://evil.test/offer'], messageId: 'link-bad' }),
    );
    const allowed = await app.pipeline.handle(
      message({ text: 'ссылка', urls: ['https://safe.test/docs'], messageId: 'link-ok' }),
    );
    await app.remover.drain();

    expect(blocked.decision).toBe(Decision.DELETE);
    expect(allowed.decision).toBe(Decision.ALLOW);
    expect(app.gateway.deleted).toEqual(['link-bad']);
  });

  it('detects flood inside the sliding window', async () => {
    const app = await harness();
    app.settings.floodLimit = 3;
    app.settings.floodWindowMs = 10_000;
    app.settings.moderateFlood = true;
    await app.repos.settings.save(app.settings);

    const first = await app.pipeline.handle(message({ text: 'раз', messageId: 'f1' }));
    const second = await app.pipeline.handle(message({ text: 'два', messageId: 'f2' }));
    const third = await app.pipeline.handle(message({ text: 'три', messageId: 'f3' }));

    expect(first.decision).toBe(Decision.ALLOW);
    expect(second.decision).toBe(Decision.ALLOW);
    expect(third.decision).toBe(Decision.WARN);
    expect(third.primary?.reason).toMatch(/^flood:3/);
    expect(await app.repos.violations.countByUser('1', '42')).toBe(1);
    const audits = await app.repos.audit.listRecent('1', 10);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe('WARN');
  });
});

describe('rate limiter', () => {
  it('allows at most two deletions per second in one chat', async () => {
    let now = 0;
    const clock: Clock = {
      now: () => now,
      sleep: async (ms: number) => {
        now += ms;
      },
    };
    const limiter = new SlidingWindowRateLimiter(2, 1_000, clock);
    const deletedAt: number[] = [];
    const remover = new QueuedMessageRemover(
      limiter,
      async () => {
        deletedAt.push(now);
      },
      async () => undefined,
    );
    for (let index = 0; index < 5; index += 1) {
      remover.enqueue({ chatId: '77', messageId: `d${index}`, reason: 'test' });
    }
    await remover.drain();

    expect(deletedAt).toEqual([0, 0, 1_000, 1_000, 2_000]);
    for (const timestamp of deletedAt) {
      const count = deletedAt.filter(
        (item) => item <= timestamp && item > timestamp - 1_000,
      ).length;
      expect(count).toBeLessThanOrEqual(2);
    }
  });
});

describe('incoming update', () => {
  it('reads urls from text and link buttons and ignores a malformed payload', () => {
    const parsed = parseMessageCreated({
      update_type: 'message_created',
      timestamp: 10,
      message: {
        sender: { user_id: 5, is_bot: false, first_name: 'A' },
        recipient: { chat_id: 9, chat_type: 'chat' },
        body: {
          mid: 'mid-1',
          text: 'смотри https://example.com/a',
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'link', text: 'сайт', url: 'https://buttons.test/x' }]],
              },
            },
          ],
        },
      },
    });
    expect(parsed?.urls).toEqual(
      expect.arrayContaining(['https://example.com/a', 'https://buttons.test/x']),
    );
    expect(parseMessageCreated({ update_type: 'message_created' })).toBeNull();
  });
});
