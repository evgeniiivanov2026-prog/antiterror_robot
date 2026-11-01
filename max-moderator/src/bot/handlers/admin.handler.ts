import type { KeyValueCache } from '../../cache/cache.js';
import { LinkList, LinkMode, ModerationAction, RuleType, Severity } from '../../domain/enums.js';
import type { IncomingMessage } from '../../domain/messages.js';
import type { ChatSettings } from '../../domain/models.js';
import type { Repositories } from '../../database/repositories/types.js';
import { canDeleteMessages } from '../../max/max-client.js';
import type { MaxGateway } from '../../max/gateway.js';
import type { MessageRemover } from '../../max/message-remover.js';
import type { AuditService } from '../../moderation/audit.service.js';
import type { LinkFilterService } from '../../moderation/link-filter.service.js';
import type { ModerationPipeline } from '../../moderation/moderation-pipeline.service.js';
import type { PermissionService } from '../../moderation/permissions.js';
import type { WordFilterService } from '../../moderation/word-filter.service.js';
import { UnsafeRegexError } from '../../utils/safe-regex.js';
import { isPublicCommand, parseCommand, tokenize } from '../commands.js';

const CONFIRM_TTL_SECONDS = 60;
const MAX_IMPORT = 200;
const MAX_PURGE = 50;

const HELP = [
  'Команды модерации:',
  '/config — настройки чата',
  '/config set <параметр> <значение>',
  '/filter add <слово|"фраза">',
  '/filter regex "<шаблон>"',
  '/filter list',
  '/filter remove <id>',
  '/filter enable <id> / /filter disable <id>',
  '/filter action <id> delete|warn|review|mute|kick|notify',
  '/filter severity <id> low|medium|high|critical',
  '/filter import — список слов со следующей строки',
  '/filter lexicon — включить стартовый словарь',
  '/filter clear и затем /filter clear confirm',
  '/links mode allow|deny|review',
  '/links add <домен> — чёрный список',
  '/links trust <домен> — белый список',
  '/links remove <домен>',
  '/links list',
  '/whitelist add <userId> [причина]',
  '/whitelist remove <userId>',
  '/warnings <userId>',
  '/audit — последние 20 действий',
  '/purge <count> — если очистка включена и у бота есть право write',
].join('\n');

export class AdminCommandService {
  constructor(
    private readonly deps: {
      repos: Repositories;
      words: WordFilterService;
      links: LinkFilterService;
      permissions: PermissionService;
      audit: AuditService;
      pipeline: ModerationPipeline;
      gateway: MaxGateway;
      remover: MessageRemover;
      cache: KeyValueCache;
    },
  ) {}

  async execute(message: IncomingMessage): Promise<string | null> {
    const command = parseCommand(message.text);
    if (!command) return null;
    if (message.chatType === 'dialog' && !isPublicCommand(command.name)) {
      return 'Команды настройки выполняются в групповом чате, где бот — администратор.';
    }
    if (!isPublicCommand(command.name)) {
      const privilege = await this.deps.permissions.resolve(message.chatId, message.userId);
      if (privilege !== 'privileged')
        return 'Недостаточно прав. Команда доступна владельцу, администраторам чата и ADMIN_IDS.';
    }

    try {
      return await this.dispatch(message, command.name, command.args);
    } catch (error) {
      if (error instanceof UnsafeRegexError) return error.message;
      const text = error instanceof Error ? error.message : 'Команда не выполнена';
      return text.slice(0, 300);
    }
  }

  private async dispatch(
    message: IncomingMessage,
    name: string,
    args: string,
  ): Promise<string | null> {
    switch (name) {
      case 'start':
        return `Бот модерирует групповой чат: слова, ссылки, флуд и капс.\n${HELP}`;
      case 'help':
        return HELP;
      case 'config':
        return this.config(message, args);
      case 'filter':
        return this.filter(message, args);
      case 'links':
        return this.links(message, args);
      case 'whitelist':
        return this.whitelist(message, args);
      case 'warnings':
        return this.warnings(message, args);
      case 'audit':
        return this.audit(message);
      case 'purge':
        return this.purge(message, args);
      default:
        return null;
    }
  }

  private async config(message: IncomingMessage, args: string): Promise<string> {
    const settings = await this.deps.pipeline.ensureSettings(message.chatId);
    const tokens = tokenize(args);
    const head = tokens[0];
    if (!head) return renderSettings(settings);
    if (head !== 'set') return 'Формат: /config set <параметр> <значение>';
    const key = tokens[1]?.toLowerCase();
    const value = tokens[2]?.toLowerCase();
    if (!key || !value) return 'Формат: /config set <параметр> <значение>';
    const next = applySetting(settings, key, value);
    if (!next)
      return 'Неизвестный параметр. Доступны: caps, flood, mentions, media, forwards, purge, wholeword, hard.';
    await this.deps.repos.settings.save(next);
    await this.record(message, 'config_set', `${key}=${value}`);
    return renderSettings(next);
  }

  private async filter(message: IncomingMessage, args: string): Promise<string> {
    const settings = await this.deps.pipeline.ensureSettings(message.chatId);
    const tokens = tokenize(args);
    const sub = tokens[0]?.toLowerCase();
    if (!sub) return 'Укажите подкоманду. /help';
    if (sub === 'list') return this.filterList(message.chatId);
    if (sub === 'add') return this.filterAdd(message, tokens.slice(1), settings);
    if (sub === 'regex') return this.filterRegex(message, tokens.slice(1), settings);
    if (sub === 'remove') return this.filterRemove(message, tokens[1]);
    if (sub === 'enable' || sub === 'disable')
      return this.filterToggle(message, tokens[1], sub === 'enable');
    if (sub === 'action') return this.filterAction(message, tokens[1], tokens[2]);
    if (sub === 'severity') return this.filterSeverity(message, tokens[1], tokens[2]);
    if (sub === 'import') return this.filterImport(message, args, settings);
    if (sub === 'lexicon') return this.filterLexicon(message, settings);
    if (sub === 'clear') return this.filterClear(message, tokens[1]);
    return 'Неизвестная подкоманда фильтра. /help';
  }

  private async filterList(chatId: string): Promise<string> {
    const rows = await this.deps.words.list(chatId);
    if (rows.length === 0) return 'Фильтров нет.';
    const lines = rows.slice(0, 40).map((row) => {
      const mark = row.enabled ? 'on' : 'off';
      return `${row.id}. [${mark}] ${row.type} ${row.action}/${row.severity} ${row.pattern}`;
    });
    if (rows.length > 40) lines.push(`… и ещё ${rows.length - 40}`);
    return lines.join('\n');
  }

  private async filterAdd(
    message: IncomingMessage,
    tokens: string[],
    settings: ChatSettings,
  ): Promise<string> {
    const pattern = tokens.join(' ').trim();
    if (pattern.length < 2 || pattern.length > 200) return 'Слово или фраза: от 2 до 200 символов.';
    const created = await this.deps.words.add({
      chatId: message.chatId,
      type: RuleType.WORD,
      pattern,
      action: settings.defaultAction,
      severity: Severity.MEDIUM,
      wholeWord: settings.wholeWord,
      createdBy: message.userId,
    });
    await this.record(message, 'filter_add', `id=${created.id}`, { ruleId: created.id });
    return `Фильтр ${created.id} добавлен: ${created.pattern} (${created.action}, ${created.severity}).`;
  }

  private async filterRegex(
    message: IncomingMessage,
    tokens: string[],
    settings: ChatSettings,
  ): Promise<string> {
    const pattern = tokens.join(' ').trim();
    const created = await this.deps.words.add({
      chatId: message.chatId,
      type: RuleType.REGEX,
      pattern,
      action: settings.defaultAction,
      severity: Severity.MEDIUM,
      wholeWord: false,
      createdBy: message.userId,
    });
    await this.record(message, 'filter_regex', `id=${created.id}`, { ruleId: created.id });
    return `Regex-фильтр ${created.id} добавлен.`;
  }

  private async filterRemove(message: IncomingMessage, rawId: string | undefined): Promise<string> {
    const id = parseId(rawId);
    if (!id) return 'Формат: /filter remove <id>';
    const removed = await this.deps.words.remove(message.chatId, id);
    if (!removed) return 'Фильтр не найден.';
    await this.record(message, 'filter_remove', `id=${id}`, { ruleId: id });
    return `Фильтр ${id} удалён.`;
  }

  private async filterToggle(
    message: IncomingMessage,
    rawId: string | undefined,
    enabled: boolean,
  ): Promise<string> {
    const id = parseId(rawId);
    if (!id) return 'Формат: /filter enable <id>';
    const saved = await this.deps.words.setEnabled(message.chatId, id, enabled);
    if (!saved) return 'Фильтр не найден.';
    await this.record(message, enabled ? 'filter_enable' : 'filter_disable', `id=${id}`, {
      ruleId: id,
    });
    return `Фильтр ${id} ${enabled ? 'включён' : 'выключен'}.`;
  }

  private async filterAction(
    message: IncomingMessage,
    rawId: string | undefined,
    rawAction: string | undefined,
  ): Promise<string> {
    const id = parseId(rawId);
    const action = parseAction(rawAction);
    if (!id || !action) return 'Формат: /filter action <id> delete|warn|review|mute|kick|notify';
    const saved = await this.deps.words.setAction(message.chatId, id, action);
    if (!saved) return 'Фильтр не найден.';
    await this.record(message, 'filter_action', `${id}=${action}`, { ruleId: id });
    return `Фильтр ${id}: действие ${action}.`;
  }

  private async filterSeverity(
    message: IncomingMessage,
    rawId: string | undefined,
    rawSeverity: string | undefined,
  ): Promise<string> {
    const id = parseId(rawId);
    const severity = parseSeverity(rawSeverity);
    if (!id || !severity) return 'Формат: /filter severity <id> low|medium|high|critical';
    const saved = await this.deps.words.setSeverity(message.chatId, id, severity);
    if (!saved) return 'Фильтр не найден.';
    await this.record(message, 'filter_severity', `${id}=${severity}`, { ruleId: id });
    return `Фильтр ${id}: severity ${severity}.`;
  }

  private async filterImport(
    message: IncomingMessage,
    args: string,
    settings: ChatSettings,
  ): Promise<string> {
    const body = args.replace(/^import\s*/i, '');
    const lines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_IMPORT);
    if (lines.length === 0) return 'После /filter import укажите слова, каждое с новой строки.';
    const count = await this.deps.words.importLines(message.chatId, lines, message.userId, {
      action: settings.defaultAction,
      severity: Severity.MEDIUM,
      wholeWord: settings.wholeWord,
    });
    await this.record(message, 'filter_import', `count=${count}`);
    return `Импортировано фильтров: ${count}.`;
  }

  private async filterLexicon(message: IncomingMessage, settings: ChatSettings): Promise<string> {
    const count = await this.deps.words.seedLexicon(
      message.chatId,
      message.userId,
      settings.defaultAction,
    );
    await this.record(message, 'filter_lexicon', `count=${count}`);
    return count === 0 ? 'Словарь уже установлен.' : `Добавлено слов стартового словаря: ${count}.`;
  }

  private async filterClear(
    message: IncomingMessage,
    confirmation: string | undefined,
  ): Promise<string> {
    const key = `confirm:clear:${message.chatId}:${message.userId}`;
    if (confirmation?.toLowerCase() !== 'confirm') {
      await this.deps.cache.set(key, '1', CONFIRM_TTL_SECONDS);
      return 'Это удалит все фильтры чата. Для подтверждения: /filter clear confirm';
    }
    const pending = await this.deps.cache.get(key);
    if (pending !== '1') return 'Подтверждение истекло. Снова отправьте /filter clear.';
    await this.deps.cache.del(key);
    const count = await this.deps.words.clear(message.chatId);
    await this.record(message, 'filter_clear', `count=${count}`);
    return `Удалено фильтров: ${count}.`;
  }

  private async links(message: IncomingMessage, args: string): Promise<string> {
    const settings = await this.deps.pipeline.ensureSettings(message.chatId);
    const tokens = tokenize(args);
    const sub = tokens[0]?.toLowerCase();
    if (sub === 'mode') {
      const mode = tokens[1]?.toLowerCase();
      if (mode !== LinkMode.ALLOW && mode !== LinkMode.DENY && mode !== LinkMode.REVIEW) {
        return 'Формат: /links mode allow|deny|review';
      }
      settings.linkMode = mode;
      await this.deps.repos.settings.save(settings);
      await this.record(message, 'links_mode', mode);
      return `Режим ссылок: ${mode}.`;
    }
    if (sub === 'list') {
      const rows = await this.deps.links.list(message.chatId);
      if (rows.length === 0) return 'Правил для доменов нет.';
      return rows.map((row) => `${row.domain} ${row.list} ${row.action}`).join('\n');
    }
    if (sub === 'add' || sub === 'trust') {
      const domain = tokens[1];
      if (!domain) return 'Укажите домен.';
      const list = sub === 'trust' ? LinkList.WHITELIST : LinkList.BLACKLIST;
      const action = sub === 'trust' ? ModerationAction.NOTIFY_ADMINS : ModerationAction.DELETE;
      const saved = await this.deps.links.add(message.chatId, domain, list, action);
      if (!saved) return 'Домен не распознан.';
      await this.record(message, sub === 'trust' ? 'links_trust' : 'links_add', saved.domain);
      return `${saved.domain} добавлен в ${list}.`;
    }
    if (sub === 'remove') {
      const domain = tokens[1];
      if (!domain) return 'Укажите домен.';
      const removed = await this.deps.links.remove(message.chatId, domain);
      if (!removed) return 'Домен не найден.';
      await this.record(message, 'links_remove', domain);
      return 'Домен удалён из правил.';
    }
    return 'Формат: /links mode|add|trust|remove|list';
  }

  private async whitelist(message: IncomingMessage, args: string): Promise<string> {
    const tokens = tokenize(args);
    const sub = tokens[0]?.toLowerCase();
    const userId = tokens[1];
    if ((sub !== 'add' && sub !== 'remove') || !userId || !/^[0-9]+$/.test(userId)) {
      return 'Формат: /whitelist add <userId> [причина] или /whitelist remove <userId>';
    }
    if (sub === 'remove') {
      const removed = await this.deps.repos.whitelist.remove(message.chatId, userId);
      await this.record(message, 'whitelist_remove', userId, undefined, userId);
      return removed
        ? `Пользователь ${userId} убран из белого списка.`
        : 'Пользователя не было в белом списке.';
    }
    const reason = tokens.slice(2).join(' ').slice(0, 200) || null;
    await this.deps.repos.whitelist.add({
      chatId: message.chatId,
      userId,
      reason,
      createdBy: message.userId,
    });
    await this.record(message, 'whitelist_add', userId, undefined, userId);
    return `Пользователь ${userId} в белом списке.`;
  }

  private async warnings(message: IncomingMessage, args: string): Promise<string> {
    const userId = tokenize(args)[0];
    if (!userId || !/^[0-9]+$/.test(userId)) return 'Формат: /warnings <userId>';
    const total = await this.deps.repos.violations.countByUser(message.chatId, userId);
    const recent = await this.deps.repos.violations.listByUser(message.chatId, userId, 5);
    if (total === 0) return `Нарушений у ${userId} нет.`;
    const lines = [
      `Нарушений: ${total}`,
      ...recent.map(
        (item) =>
          `${item.createdAt.toISOString()} ${item.violationType} ${item.action} ${item.reason}`,
      ),
    ];
    return lines.join('\n');
  }

  private async auditList(message: IncomingMessage): Promise<string> {
    const rows = await this.deps.repos.audit.listRecent(message.chatId, 20);
    if (rows.length === 0) return 'Журнал пуст.';
    return rows
      .map(
        (row) =>
          `${row.createdAt.toISOString()} ${row.action} actor=${row.actorId} target=${row.targetUserId ?? '—'} ${row.reason}`,
      )
      .join('\n');
  }

  private async audit(message: IncomingMessage): Promise<string> {
    return this.auditList(message);
  }

  private async purge(message: IncomingMessage, args: string): Promise<string> {
    const settings = await this.deps.pipeline.ensureSettings(message.chatId);
    if (!settings.purgeEnabled) return 'Очистка выключена. Включите её: /config set purge on';
    const count = Number(tokenize(args)[0]);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PURGE)
      return `Укажите число от 1 до ${MAX_PURGE}.`;
    const permissions = await this.deps.gateway.getBotPermissions(message.chatId);
    if (!canDeleteMessages(permissions))
      return 'У бота нет права удалять сообщения. Нужно право write.';
    const recent = await this.deps.gateway.listRecentMessages(message.chatId, count);
    let queued = 0;
    for (const item of recent) {
      if (!item.userId) continue;
      if (await this.deps.repos.whitelist.has(message.chatId, item.userId)) continue;
      const privilege = await this.deps.permissions.resolve(message.chatId, item.userId);
      if (privilege === 'privileged') continue;
      this.deps.remover.enqueue({
        chatId: message.chatId,
        messageId: item.messageId,
        reason: 'purge',
      });
      queued += 1;
    }
    await this.record(message, 'purge', `queued=${queued}`);
    return `В очереди на удаление: ${queued}. Лимит чата — 2 удаления в секунду.`;
  }

  private async record(
    message: IncomingMessage,
    action: string,
    reason: string,
    metadata?: Record<string, unknown>,
    targetUserId?: string,
  ): Promise<void> {
    await this.deps.audit.record({
      chatId: message.chatId,
      actorId: message.userId,
      targetUserId: targetUserId ?? null,
      action,
      reason,
      metadata,
    });
  }
}

function renderSettings(settings: ChatSettings): string {
  return [
    `Чат ${settings.chatId}`,
    `Модерация: ${settings.enabled ? 'включена' : 'выключена'}`,
    `Ссылки: ${settings.linkMode}`,
    `Действие по умолчанию: ${settings.defaultAction}`,
    `wholeWord: ${settings.wholeWord ? 'on' : 'off'}`,
    `Капс: ${settings.moderateCaps ? 'on' : 'off'} (${Math.round(settings.capsRatio * 100)}% от ${settings.capsMinLength} букв)`,
    `Флуд: ${settings.moderateFlood ? 'on' : 'off'} (${settings.floodLimit} сообщений / ${settings.floodWindowMs} мс, повтор ${settings.repeatLimit})`,
    `Упоминания: ${settings.moderateMentions ? 'on' : 'off'} (порог ${settings.mentionLimit})`,
    `Медиа: ${settings.moderateMedia ? 'on' : 'off'}`,
    `Пересылки: ${settings.moderateForwards ? 'on' : 'off'}`,
    `Очистка: ${settings.purgeEnabled ? 'on' : 'off'}`,
    `Жёсткое действие CRITICAL: ${settings.hardAction}`,
  ].join('\n');
}

function applySetting(settings: ChatSettings, key: string, value: string): ChatSettings | null {
  const on = value === 'on' || value === 'true' || value === '1';
  const off = value === 'off' || value === 'false' || value === '0';
  const copy = { ...settings };
  switch (key) {
    case 'caps':
      if (!on && !off) return null;
      copy.moderateCaps = on;
      return copy;
    case 'flood':
      if (!on && !off) return null;
      copy.moderateFlood = on;
      return copy;
    case 'mentions':
      if (!on && !off) return null;
      copy.moderateMentions = on;
      return copy;
    case 'media':
      if (!on && !off) return null;
      copy.moderateMedia = on;
      return copy;
    case 'forwards':
      if (!on && !off) return null;
      copy.moderateForwards = on;
      return copy;
    case 'purge':
      if (!on && !off) return null;
      copy.purgeEnabled = on;
      return copy;
    case 'wholeword':
      if (!on && !off) return null;
      copy.wholeWord = on;
      return copy;
    case 'hard': {
      const action = parseAction(value);
      if (!action) return null;
      copy.hardAction = action;
      return copy;
    }
    default:
      return null;
  }
}

function parseId(value: string | undefined): number | null {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseAction(value: string | undefined): ModerationAction | null {
  switch (value?.toLowerCase()) {
    case 'delete':
      return ModerationAction.DELETE;
    case 'warn':
      return ModerationAction.WARN;
    case 'review':
      return ModerationAction.REVIEW;
    case 'mute':
      return ModerationAction.MUTE;
    case 'kick':
      return ModerationAction.KICK;
    case 'notify':
    case 'notify_admins':
      return ModerationAction.NOTIFY_ADMINS;
    default:
      return null;
  }
}

function parseSeverity(value: string | undefined): Severity | null {
  switch (value?.toLowerCase()) {
    case 'low':
      return Severity.LOW;
    case 'medium':
      return Severity.MEDIUM;
    case 'high':
      return Severity.HIGH;
    case 'critical':
      return Severity.CRITICAL;
    default:
      return null;
  }
}
