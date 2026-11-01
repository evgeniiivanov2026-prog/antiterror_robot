import type { AppConfig } from '../../config/env.js';
import { defaultChatSettings } from '../../config/env.js';
import type { Repositories } from '../../database/repositories/types.js';
import {
  AdminRoleName,
  LinkList,
  LinkMode,
  ModerationAction,
  RuleType,
  Severity,
  type PolicyMode,
} from '../../domain/enums.js';
import type { ChatSettingsRecord, IncomingMessage } from '../../domain/types.js';
import type { MaxClient } from '../../max/max-client.js';
import type { MessageRemover } from '../../max/message-remover.js';
import type { AuditService } from '../../moderation/audit.service.js';
import type { PermissionService } from '../../moderation/permissions.service.js';
import type { RulesCache } from '../../moderation/rules-cache.js';
import type { Clock } from '../../utils/clock.js';
import { firstToken, parseCommand, unquote } from '../../utils/command-parser.js';
import { parsePositiveInt, parseUserId } from '../../utils/ids.js';
import { logger } from '../../utils/logger.js';
import { UnsafeRegexError, compileUserRegex } from '../../utils/regex-guard.js';
import { normalizeText } from '../../utils/text-normalizer.js';
import { normalizeDomainInput } from '../../utils/url-extractor.js';

const HELP = [
  'Команды модерации. Их могут вызывать владелец, администратор чата, ADMIN_IDS и роль ADMIN.',
  '/config — текущие настройки',
  '/config enabled on|off',
  '/config wholeword on|off',
  '/config purge on|off',
  '/config hard notify|mute|kick',
  '/config media off|review|delete|warn',
  '/config forward off|review|delete|warn',
  '/config caps on|off',
  '/config flood <макс> <секунд>',
  '/config mentions <макс>',
  '/config mute <минут>',
  '/filter add <слово или "фраза">',
  '/filter regex "<шаблон>"',
  '/filter list',
  '/filter remove <id>',
  '/filter enable <id> и /filter disable <id>',
  '/filter action <id> delete|warn|review|mute|kick|notify',
  '/filter severity <id> low|medium|high|critical',
  '/filter import — список слов со следующей строки',
  '/filter clear и затем /filter clear confirm',
  '/links mode allow|deny|review',
  '/links add <домен> — чёрный список',
  '/links allow <домен> — белый список',
  '/links remove <домен>',
  '/whitelist add <userId>',
  '/whitelist remove <userId>',
  '/warnings <userId>',
  '/audit — последние 20 действий',
  '/purge <1-20> — если очистка включена и у бота есть право write',
  '/admin grant <userId> и /admin revoke <userId> — только владелец или ADMIN_IDS',
].join('\n');

const ACTIONS: Record<string, ModerationAction> = {
  delete: ModerationAction.DELETE,
  warn: ModerationAction.WARN,
  review: ModerationAction.REVIEW,
  mute: ModerationAction.MUTE,
  kick: ModerationAction.KICK,
  notify: ModerationAction.NOTIFY_ADMINS,
};

const SEVERITIES: Record<string, Severity> = {
  low: Severity.LOW,
  medium: Severity.MEDIUM,
  high: Severity.HIGH,
  critical: Severity.CRITICAL,
};

export class AdminHandler {
  constructor(
    private readonly repos: Repositories,
    private readonly cache: RulesCache,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly remover: MessageRemover,
    private readonly max: MaxClient,
    private readonly config: Pick<AppConfig, 'defaultLinkMode' | 'defaultWordAction' | 'adminIds'>,
    private readonly clock: Clock,
  ) {}

  async handle(message: IncomingMessage): Promise<string[]> {
    const command = parseCommand(message.text);
    if (!command) return [];
    try {
      if (command.name === 'start') {
        return [
          'Я модератор группового чата MAX. Добавьте меня администратором с правом write (удаление сообщений). /help — список команд.',
        ];
      }
      if (command.name === 'help') return [HELP];
      if (!(await this.permissions.isCommandAdmin(message))) {
        return [
          'Недостаточно прав. Команда доступна владельцу, администратору чата, ADMIN_IDS или роли ADMIN.',
        ];
      }
      switch (command.name) {
        case 'config':
          return [await this.configCommand(message, command.args)];
        case 'filter':
          return [await this.filterCommand(message, command.args)];
        case 'links':
          return [await this.linksCommand(message, command.args)];
        case 'whitelist':
          return [await this.whitelistCommand(message, command.args)];
        case 'warnings':
          return [await this.warnings(message, command.args)];
        case 'audit':
          return [await this.auditList(message)];
        case 'purge':
          return [await this.purge(message, command.args)];
        case 'admin':
          return [await this.adminRole(message, command.args)];
        default:
          return ['Неизвестная команда. /help'];
      }
    } catch (error) {
      logger.error({ err: error, chatId: message.chatId }, 'admin command failed');
      return ['Команда не выполнена. Подробности в журнале бота, без текста сообщения.'];
    }
  }

  private async configCommand(message: IncomingMessage, args: string): Promise<string> {
    const settings = await this.ensureSettings(message.chatId);
    if (!args) return formatSettings(settings);
    const { token, rest } = firstToken(args);
    const flag = parseOnOff(rest);
    if (token === 'enabled' && flag !== null) settings.enabled = flag;
    else if (token === 'wholeword' && flag !== null) settings.wholeWord = flag;
    else if (token === 'purge' && flag !== null) settings.allowPurge = flag;
    else if (token === 'caps' && flag !== null) settings.capsEnabled = flag;
    else if (token === 'hard' && ACTIONS[rest]) settings.hardAction = ACTIONS[rest];
    else if ((token === 'media' || token === 'forward') && isPolicy(rest)) {
      if (token === 'media') settings.mediaMode = rest;
      else settings.forwardMode = rest;
    } else if (token === 'flood') {
      const [maxRaw, windowRaw] = rest.split(/\s+/);
      const max = parsePositiveInt(maxRaw, 50);
      const windowSec = parsePositiveInt(windowRaw, 3600);
      if (!max || !windowSec) return 'Формат: /config flood <макс> <секунд>';
      settings.floodMaxMessages = max;
      settings.floodWindowSec = windowSec;
    } else if (token === 'mentions') {
      const max = parsePositiveInt(rest, 50);
      if (!max) return 'Формат: /config mentions <макс>';
      settings.mentionMax = max;
    } else if (token === 'mute') {
      const minutes = parsePositiveInt(rest, 1440);
      if (!minutes) return 'Формат: /config mute <минут>';
      settings.muteMinutes = minutes;
    } else {
      return 'Не понял настройку. /help';
    }
    await this.repos.settings.save(settings);
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'config_update', token);
    return formatSettings(settings);
  }

  private async filterCommand(message: IncomingMessage, args: string): Promise<string> {
    const { token, rest } = firstToken(args);
    if (token === 'add') return this.addFilter(message, unquote(rest), RuleType.WORD);
    if (token === 'regex') return this.addRegex(message, unquote(rest));
    if (token === 'list') return this.listFilters(message.chatId);
    if (token === 'remove') return this.removeFilter(message, rest);
    if (token === 'enable' || token === 'disable')
      return this.toggleFilter(message, rest, token === 'enable');
    if (token === 'action') return this.patchAction(message, rest);
    if (token === 'severity') return this.patchSeverity(message, rest);
    if (token === 'import') return this.importFilters(message, rest);
    if (token === 'clear') return this.clearFilters(message, rest);
    if (token === 'ai') return this.aiRule(message, rest);
    return 'Формат фильтра: /filter add|regex|list|remove|enable|disable|action|severity|import|clear';
  }

  private async addFilter(
    message: IncomingMessage,
    pattern: string,
    type: RuleType,
  ): Promise<string> {
    const normalized = normalizeText(pattern);
    if ([...normalized].length < 2 || [...normalized].length > 80) {
      return 'Слово или фраза должны быть длиной от 2 до 80 символов.';
    }
    const settings = await this.ensureSettings(message.chatId);
    const created = await this.repos.filters.create({
      chatId: message.chatId,
      type,
      pattern: normalized,
      action: settings.defaultAction,
      severity: Severity.MEDIUM,
      enabled: true,
      createdBy: message.userId,
    });
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_add', `id=${created.id}`);
    return `Фильтр ${created.id} добавлен: ${created.type} / ${created.action} / ${created.severity}.`;
  }

  private async addRegex(message: IncomingMessage, pattern: string): Promise<string> {
    try {
      compileUserRegex(pattern);
    } catch (error) {
      const reason = error instanceof UnsafeRegexError ? error.message : 'Regex отклонён';
      return reason;
    }
    const settings = await this.ensureSettings(message.chatId);
    const created = await this.repos.filters.create({
      chatId: message.chatId,
      type: RuleType.REGEX,
      pattern,
      action: settings.defaultAction,
      severity: Severity.MEDIUM,
      enabled: true,
      createdBy: message.userId,
    });
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_add', `id=${created.id}`);
    return `Regex-фильтр ${created.id} добавлен.`;
  }

  private async listFilters(chatId: string): Promise<string> {
    const rows = await this.repos.filters.list(chatId);
    if (rows.length === 0) return 'Фильтров нет.';
    const lines = rows.slice(0, 30).map((row) => {
      const pattern = row.pattern.length > 60 ? `${row.pattern.slice(0, 60)}…` : row.pattern;
      return `${row.id}. ${row.enabled ? 'on' : 'off'} ${row.type} ${row.action} ${row.severity} ${pattern}`;
    });
    if (rows.length > 30) lines.push(`Ещё ${rows.length - 30}.`);
    return lines.join('\n');
  }

  private async removeFilter(message: IncomingMessage, args: string): Promise<string> {
    const id = parsePositiveInt(firstToken(args).token, 1_000_000_000);
    if (!id) return 'Укажите id фильтра.';
    const removed = await this.repos.filters.remove(message.chatId, id);
    if (!removed) return 'Фильтр не найден в этом чате.';
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_remove', `id=${id}`);
    return `Фильтр ${id} удалён.`;
  }

  private async toggleFilter(
    message: IncomingMessage,
    args: string,
    enabled: boolean,
  ): Promise<string> {
    const id = parsePositiveInt(firstToken(args).token, 1_000_000_000);
    if (!id) return 'Укажите id фильтра.';
    const updated = await this.repos.filters.update(message.chatId, id, { enabled });
    if (!updated) return 'Фильтр не найден в этом чате.';
    await this.cache.invalidate(message.chatId);
    await this.record(message, enabled ? 'filter_enable' : 'filter_disable', `id=${id}`);
    return `Фильтр ${id} ${enabled ? 'включён' : 'выключен'}.`;
  }

  private async patchAction(message: IncomingMessage, args: string): Promise<string> {
    const { token, rest } = firstToken(args);
    const id = parsePositiveInt(token, 1_000_000_000);
    const action = ACTIONS[rest.toLowerCase()];
    if (!id || !action) return 'Формат: /filter action <id> delete|warn|review|mute|kick|notify';
    const updated = await this.repos.filters.update(message.chatId, id, { action });
    if (!updated) return 'Фильтр не найден в этом чате.';
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_action', `id=${id}`);
    return `Фильтр ${id}: действие ${action}.`;
  }

  private async patchSeverity(message: IncomingMessage, args: string): Promise<string> {
    const { token, rest } = firstToken(args);
    const id = parsePositiveInt(token, 1_000_000_000);
    const severity = SEVERITIES[rest.toLowerCase()];
    if (!id || !severity) return 'Формат: /filter severity <id> low|medium|high|critical';
    const updated = await this.repos.filters.update(message.chatId, id, { severity });
    if (!updated) return 'Фильтр не найден в этом чате.';
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_severity', `id=${id}`);
    return `Фильтр ${id}: severity ${severity}.`;
  }

  private async importFilters(message: IncomingMessage, args: string): Promise<string> {
    const lines = args
      .split(/\r?\n/)
      .map((line) => unquote(line.trim()))
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    if (lines.length === 0) return 'Добавьте слова со следующей строки после /filter import.';
    if (lines.length > 200) return 'За один импорт можно добавить не больше 200 строк.';
    const settings = await this.ensureSettings(message.chatId);
    let added = 0;
    for (const line of lines) {
      const normalized = normalizeText(line);
      if ([...normalized].length < 2 || [...normalized].length > 80) continue;
      await this.repos.filters.create({
        chatId: message.chatId,
        type: RuleType.WORD,
        pattern: normalized,
        action: settings.defaultAction,
        severity: Severity.MEDIUM,
        enabled: true,
        createdBy: message.userId,
      });
      added += 1;
    }
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_import', `count=${added}`);
    return `Импортировано фильтров: ${added}.`;
  }

  private async clearFilters(message: IncomingMessage, args: string): Promise<string> {
    const key = `confirm:clear:${message.chatId}:${message.userId}`;
    if (args.toLowerCase() !== 'confirm') {
      await this.cache.remember(key, 60);
      return 'Это удалит все фильтры слов и regex этого чата. Для подтверждения: /filter clear confirm';
    }
    const pending = await this.cache.has(key);
    if (!pending) return 'Подтверждение устарело. Снова отправьте /filter clear.';
    const removed = await this.repos.filters.clear(message.chatId);
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_clear', `count=${removed}`);
    return `Удалено фильтров: ${removed}.`;
  }

  private async aiRule(message: IncomingMessage, args: string): Promise<string> {
    const enabled = parseOnOff(args);
    if (enabled === null) return 'Формат: /filter ai on|off';
    const existing = (await this.repos.filters.list(message.chatId)).find(
      (item) => item.type === RuleType.CUSTOM_AI,
    );
    if (!existing) {
      await this.repos.filters.create({
        chatId: message.chatId,
        type: RuleType.CUSTOM_AI,
        pattern: 'external',
        action: ModerationAction.REVIEW,
        severity: Severity.MEDIUM,
        enabled,
        createdBy: message.userId,
      });
    } else {
      await this.repos.filters.update(message.chatId, existing.id, { enabled });
    }
    await this.cache.invalidate(message.chatId);
    await this.record(message, 'filter_ai', enabled ? 'on' : 'off');
    return enabled
      ? 'AI-проверка включена как REVIEW. Нужен AI_MODERATION_URL, иначе правило ничего не делает. Ссылки бот не открывает.'
      : 'AI-проверка выключена.';
  }

  private async linksCommand(message: IncomingMessage, args: string): Promise<string> {
    const { token, rest } = firstToken(args);
    const settings = await this.ensureSettings(message.chatId);
    if (token === 'mode') {
      const mode = rest.toLowerCase();
      if (mode !== 'allow' && mode !== 'deny' && mode !== 'review') {
        return 'Формат: /links mode allow|deny|review';
      }
      settings.linkMode =
        mode === 'allow' ? LinkMode.ALLOW : mode === 'deny' ? LinkMode.DENY : LinkMode.REVIEW;
      await this.repos.settings.save(settings);
      await this.cache.invalidate(message.chatId);
      await this.record(message, 'links_mode', mode);
      return `Режим ссылок: ${settings.linkMode}.`;
    }
    if (token === 'add' || token === 'allow') {
      const domain = normalizeDomainInput(rest);
      if (!domain) return 'Укажите домен, например example.com.';
      const list = token === 'allow' ? LinkList.ALLOW : LinkList.DENY;
      await this.repos.links.upsert({
        chatId: message.chatId,
        domain,
        list,
        action: ModerationAction.DELETE,
        note: '',
      });
      await this.cache.invalidate(message.chatId);
      await this.record(message, token === 'allow' ? 'link_allow' : 'link_deny', domain);
      return token === 'allow'
        ? `Домен ${domain} в белом списке.`
        : `Домен ${domain} в чёрном списке.`;
    }
    if (token === 'remove') {
      const domain = normalizeDomainInput(rest);
      if (!domain) return 'Укажите домен.';
      const removed = await this.repos.links.remove(message.chatId, domain);
      await this.cache.invalidate(message.chatId);
      await this.record(message, 'link_remove', domain);
      return removed ? `Правило для ${domain} удалено.` : 'Такого домена нет.';
    }
    return 'Формат: /links mode|add|allow|remove';
  }

  private async whitelistCommand(message: IncomingMessage, args: string): Promise<string> {
    const { token, rest } = firstToken(args);
    const userId = parseUserId(rest);
    if (!userId || (token !== 'add' && token !== 'remove')) {
      return 'Формат: /whitelist add <userId> или /whitelist remove <userId>';
    }
    if (token === 'add') {
      await this.repos.whitelist.add({
        chatId: message.chatId,
        userId,
        reason: 'manual',
        createdBy: message.userId,
      });
      await this.record(message, 'whitelist_add', userId);
      return `Пользователь ${userId} в белом списке. Его сообщения не модерируются.`;
    }
    const removed = await this.repos.whitelist.remove(message.chatId, userId);
    await this.record(message, 'whitelist_remove', userId);
    return removed
      ? `Пользователь ${userId} убран из белого списка.`
      : 'Пользователя нет в белом списке.';
  }

  private async warnings(message: IncomingMessage, args: string): Promise<string> {
    const userId = parseUserId(args);
    if (!userId) return 'Формат: /warnings <userId>';
    const rows = await this.repos.violations.listByUser(message.chatId, userId, 20);
    if (rows.length === 0) return `Нарушений пользователя ${userId} нет.`;
    const lines = rows
      .slice(0, 10)
      .map(
        (row) => `${formatTime(row.createdAt)} ${row.violationType} ${row.severity} ${row.action}`,
      );
    return [`Нарушений в выборке: ${rows.length}`, ...lines].join('\n');
  }

  private async auditList(message: IncomingMessage): Promise<string> {
    const rows = await this.audit.listRecent(message.chatId, 20);
    if (rows.length === 0) return 'Журнал пуст.';
    return rows
      .map(
        (row) =>
          `${formatTime(row.createdAt)} ${row.action} user=${row.targetUserId ?? '-'} ${row.reason}`,
      )
      .join('\n');
  }

  private async purge(message: IncomingMessage, args: string): Promise<string> {
    const settings = await this.ensureSettings(message.chatId);
    if (!settings.allowPurge) return 'Очистка выключена. Сначала /config purge on.';
    const count = parsePositiveInt(args, 20);
    if (!count) return 'Формат: /purge <1-20>';
    const admins = await this.max.getAdmins(message.chatId);
    const bot = admins.find((admin) => admin.isBot);
    if (
      bot &&
      !bot.permissions.some(
        (item) => item === 'write' || item === 'post_edit_delete_message' || item === 'delete',
      )
    ) {
      return 'У бота нет права write на удаление сообщений в этом чате.';
    }
    const recent = await this.max.getRecentMessages(message.chatId, count + 1);
    const targets = recent.filter((item) => item.messageId !== message.messageId).slice(0, count);
    let removed = 0;
    for (const target of targets) {
      const result = await this.remover.remove(message.chatId, target.messageId);
      if (result.ok) removed += 1;
    }
    await this.record(message, 'purge', `requested=${count};removed=${removed}`);
    return `В очередь удаления поставлено успешно: ${removed} из ${targets.length}. Лимит платформы — 2 удаления в секунду.`;
  }

  private async adminRole(message: IncomingMessage, args: string): Promise<string> {
    if (!(await this.permissions.canGrant(message))) {
      return 'Выдавать внутреннюю роль может владелец чата или пользователь из ADMIN_IDS.';
    }
    const { token, rest } = firstToken(args);
    const userId = parseUserId(rest);
    if (!userId || (token !== 'grant' && token !== 'revoke')) {
      return 'Формат: /admin grant <userId> или /admin revoke <userId>';
    }
    if (token === 'grant') {
      await this.repos.admins.upsert({
        chatId: message.chatId,
        userId,
        role: AdminRoleName.ADMIN,
        createdBy: message.userId,
      });
      await this.record(message, 'admin_grant', userId);
      return `Пользователь ${userId} получил роль ADMIN.`;
    }
    const removed = await this.repos.admins.remove(message.chatId, userId);
    await this.record(message, 'admin_revoke', userId);
    return removed ? `Роль пользователя ${userId} снята.` : 'Такой роли нет.';
  }

  private async ensureSettings(chatId: string): Promise<ChatSettingsRecord> {
    return (
      (await this.repos.settings.get(chatId)) ??
      this.repos.settings.create(defaultChatSettings(chatId, this.config))
    );
  }

  private async record(message: IncomingMessage, action: string, reason: string): Promise<void> {
    await this.audit.record({
      chatId: message.chatId,
      actorId: message.userId,
      targetUserId: null,
      action,
      reason,
      metadata: { messageId: message.messageId },
    });
  }
}

function parseOnOff(value: string): boolean | null {
  const token = value.trim().toLowerCase();
  if (token === 'on' || token === 'true' || token === '1') return true;
  if (token === 'off' || token === 'false' || token === '0') return false;
  return null;
}

function isPolicy(value: string): value is PolicyMode {
  return value === 'off' || value === 'review' || value === 'delete' || value === 'warn';
}

function formatSettings(settings: ChatSettingsRecord): string {
  return [
    `Чат ${settings.chatId}`,
    `модерация: ${settings.enabled ? 'on' : 'off'}`,
    `ссылки: ${settings.linkMode}`,
    `wholeWord: ${settings.wholeWord ? 'on' : 'off'}`,
    `действие слов по умолчанию: ${settings.defaultAction}`,
    `caps: ${settings.capsEnabled ? 'on' : 'off'} >${Math.round(settings.capsRatio * 100)}% после ${settings.capsMinLength} символов`,
    `flood: ${settings.floodEnabled ? 'on' : 'off'} ${settings.floodMaxMessages} / ${settings.floodWindowSec}с`,
    `mentions: ${settings.mentionMax}`,
    `repeat: ${settings.repeatMax} / ${settings.repeatWindowSec}с`,
    `media: ${settings.mediaMode}`,
    `forward: ${settings.forwardMode}`,
    `critical: ${settings.hardAction}`,
    `локальный mute: ${settings.muteMinutes} мин`,
    `purge: ${settings.allowPurge ? 'on' : 'off'}`,
  ].join('\n');
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
