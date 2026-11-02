import type { JsonCache, KeyValue } from '../../database/cache.js';
import type { Repositories } from '../../database/repositories/types.js';
import { hasDeletePermission, type MaxGateway } from '../../max/gateway.js';
import type { MessageRemover } from '../../max/message-remover.js';
import { AuditService } from '../../moderation/audit.service.js';
import { Severity, parseSeverity } from '../../moderation/severity.js';
import {
  FilterType,
  ModerationAction,
  parseAction,
  parseHardAction,
  parseLinkMode,
  type ChatSettings,
} from '../../moderation/types.js';
import { normalizeForWords } from '../../utils/text-normalizer.js';
import { canonicalDomain } from '../../utils/url-extractor.js';
import { UnsafeRegexError, compileUserRegex } from '../../utils/safe-regex.js';
import { splitArgs, type IncomingMessage } from '../incoming.js';

export const MODERATION_COMMANDS = new Set([
  'config',
  'filter',
  'links',
  'whitelist',
  'warnings',
  'audit',
  'purge',
]);

const HELP = [
  'Команды модерации MAX:',
  '/config — настройки чата',
  '/filter add <слово|фраза>',
  '/filter regex <шаблон>',
  '/filter list',
  '/filter remove <id>',
  '/filter enable <id> и /filter disable <id>',
  '/filter action <id> delete|warn|mute|kick|review|notify_admins',
  '/filter severity <id> low|medium|high|critical',
  '/filter import — список слов со следующей строки или следующим сообщением',
  '/filter clear — очистка с подтверждением /filter clear confirm',
  '/links mode allow|deny|review',
  '/links add <домен> — чёрный список',
  '/links add <домен> allow — белый список',
  '/links remove <домен>',
  '/whitelist add <userId>',
  '/whitelist remove <userId>',
  '/warnings <userId>',
  '/audit — последние 20 действий',
  '/purge <count> — если включено /config purge on и у бота есть право write',
].join('\n');

export class AdminHandler {
  private readonly audit: AuditService;

  constructor(
    private readonly repositories: Repositories,
    private readonly gateway: MaxGateway,
    private readonly remover: MessageRemover,
    private readonly cache: JsonCache,
    private readonly kv: KeyValue,
  ) {
    this.audit = new AuditService(repositories.audit);
  }

  async handleDialog(message: IncomingMessage): Promise<void> {
    if (message.command?.name === 'start' || message.command?.name === 'help') {
      await this.reply(message, `Бот-модератор групповых чатов MAX.\n${HELP}`);
      return;
    }
    await this.reply(
      message,
      'Команды настройки выполняются в групповом чате, где бот назначен администратором.',
    );
  }

  async consumePending(message: IncomingMessage): Promise<boolean> {
    if (message.command) return false;
    const key = this.importKey(message);
    const pending = await this.kv.get(key);
    if (pending !== '1') return false;
    await this.kv.del(key);
    await this.reply(message, await this.importFilters(message, message.text));
    return true;
  }

  async handle(message: IncomingMessage): Promise<void> {
    const command = message.command;
    if (!command) return;
    const text = await this.dispatch(message, command.name, command.rest);
    if (text) await this.reply(message, text);
  }

  private async dispatch(
    message: IncomingMessage,
    name: string,
    rest: string,
  ): Promise<string | null> {
    if (name === 'start') return `Бот на связи и готов чистить чат.\n${HELP}`;
    if (name === 'help') return HELP;
    if (name === 'config') return this.config(message, rest);
    if (name === 'filter') return this.filter(message, rest);
    if (name === 'links') return this.links(message, rest);
    if (name === 'whitelist') return this.whitelist(message, rest);
    if (name === 'warnings') return this.warnings(message, rest);
    if (name === 'audit') return this.auditList(message);
    if (name === 'purge') return this.purge(message, rest);
    return null;
  }

  private async config(message: IncomingMessage, rest: string): Promise<string> {
    const args = splitArgs(rest);
    const head = args[0]?.toLowerCase();
    if (!head) {
      const settings = await this.repositories.settings.getOrCreate(message.chatId);
      return this.renderSettings(settings);
    }
    const enabled = parseToggle(args[1]);
    if (head === 'purge' && enabled !== null)
      return this.patch(message, { purgeEnabled: enabled }, 'purge');
    if (head === 'enabled' && enabled !== null) return this.patch(message, { enabled }, 'enabled');
    if (head === 'spam' && enabled !== null)
      return this.patch(message, { spamEnabled: enabled }, 'spam');
    if (head === 'caps' && enabled !== null)
      return this.patch(message, { capsEnabled: enabled }, 'caps');
    if (head === 'hard-action' && args[1]) {
      const hardAction = parseHardAction(args[1]);
      if (!hardAction) return 'Жёсткое действие: none, mute или kick.';
      return this.patch(message, { hardAction }, 'hard-action');
    }
    if (head === 'mute-minutes' && args[1]) {
      const minutes = Number(args[1]);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
        return 'Укажите минуты от 1 до 10080.';
      return this.patch(message, { muteSeconds: minutes * 60 }, 'mute-minutes');
    }
    if (head === 'language' && args[1]) {
      return this.patch(message, { language: args[1].slice(0, 16) }, 'language');
    }
    if (head === 'flood' && args[1] && args[2]) {
      const floodMax = Number(args[1]);
      const floodWindowSec = Number(args[2]);
      if (
        !Number.isInteger(floodMax) ||
        !Number.isInteger(floodWindowSec) ||
        floodMax < 2 ||
        floodWindowSec < 2
      ) {
        return 'Формат: /config flood <сообщений> <секунд>.';
      }
      return this.patch(message, { floodMax, floodWindowSec }, 'flood');
    }
    return 'Не понял настройку. /config показывает текущие значения.';
  }

  private async filter(message: IncomingMessage, rest: string): Promise<string> {
    const args = splitArgs(rest);
    const sub = args[0]?.toLowerCase();
    if (!sub)
      return 'Укажите действие: add, regex, list, remove, enable, disable, action, severity, import, clear.';
    if (sub === 'list') return this.listFilters(message.chatId);
    if (sub === 'add') return this.addFilter(message, args.slice(1).join(' '), FilterType.WORD);
    if (sub === 'regex') return this.addFilter(message, args.slice(1).join(' '), FilterType.REGEX);
    if (sub === 'remove') return this.removeFilter(message, args[1]);
    if (sub === 'enable' || sub === 'disable')
      return this.toggleFilter(message, args[1], sub === 'enable');
    if (sub === 'action') return this.changeAction(message, args[1], args[2]);
    if (sub === 'severity') return this.changeSeverity(message, args[1], args[2]);
    if (sub === 'import') return this.beginImport(message, rest);
    if (sub === 'clear') return this.clearFilters(message, args[1]);
    if (
      sub === 'media' ||
      sub === 'forward' ||
      sub === 'caps' ||
      sub === 'flood' ||
      sub === 'mentions' ||
      sub === 'ai'
    ) {
      return this.upsertStructural(message, sub, args[1]);
    }
    return 'Неизвестная подкоманда /filter.';
  }

  private async links(message: IncomingMessage, rest: string): Promise<string> {
    const args = splitArgs(rest);
    const sub = args[0]?.toLowerCase();
    if (sub === 'mode' && args[1]) {
      const mode = parseLinkMode(args[1]);
      if (!mode) return 'Режим ссылок: allow, deny или review.';
      return this.patch(message, { linkMode: mode }, 'link-mode');
    }
    if (sub === 'list') {
      const rules = await this.repositories.links.list(message.chatId);
      if (rules.length === 0) return 'Списков ссылок нет.';
      return rules
        .map((rule) => `#${rule.id} ${rule.list} ${rule.domain} ${rule.action}`)
        .join('\n');
    }
    if ((sub === 'add' || sub === 'allow') && args[1]) {
      const domain = canonicalDomain(args[1]);
      if (!domain) return 'Не удалось разобрать домен.';
      const allow = sub === 'allow' || args[2]?.toLowerCase() === 'allow';
      const rule = await this.repositories.links.upsert({
        chatId: message.chatId,
        domain,
        list: allow ? 'whitelist' : 'blacklist',
        action: allow ? ModerationAction.REVIEW : ModerationAction.DELETE,
      });
      await this.cache.invalidate(message.chatId);
      await this.auditAction(message, 'link_add', `link ${rule.list} ${rule.domain}`);
      return `${rule.list}: ${rule.domain}`;
    }
    if (sub === 'remove' && args[1]) {
      const domain = canonicalDomain(args[1]);
      if (!domain) return 'Не удалось разобрать домен.';
      const removed = await this.repositories.links.remove(message.chatId, domain);
      await this.cache.invalidate(message.chatId);
      if (removed) await this.auditAction(message, 'link_remove', domain);
      return removed ? `Домен удалён: ${domain}` : 'Такого домена нет.';
    }
    return 'Формат: /links mode|add|allow|remove|list.';
  }

  private async whitelist(message: IncomingMessage, rest: string): Promise<string> {
    const args = splitArgs(rest);
    const sub = args[0]?.toLowerCase();
    const userId = args[1];
    if (sub === 'list') {
      const rows = await this.repositories.whitelist.list(message.chatId);
      if (rows.length === 0) return 'Белый список пуст.';
      return rows.map((row) => row.userId).join('\n');
    }
    if (!userId || !/^\d+$/.test(userId)) return 'Укажите числовой userId.';
    if (sub === 'add') {
      await this.repositories.whitelist.add(
        message.chatId,
        userId,
        message.userId,
        args.slice(2).join(' ') || null,
      );
      await this.cache.invalidate(message.chatId);
      await this.auditAction(message, 'whitelist_add', userId, userId);
      return `Пользователь ${userId} в белом списке.`;
    }
    if (sub === 'remove') {
      const removed = await this.repositories.whitelist.remove(message.chatId, userId);
      await this.cache.invalidate(message.chatId);
      if (removed) await this.auditAction(message, 'whitelist_remove', userId, userId);
      return removed
        ? `Пользователь ${userId} удалён из белого списка.`
        : 'Пользователя нет в белом списке.';
    }
    return 'Формат: /whitelist add|remove|list.';
  }

  private async warnings(message: IncomingMessage, rest: string): Promise<string> {
    const userId = splitArgs(rest)[0];
    if (!userId || !/^\d+$/.test(userId)) return 'Формат: /warnings <userId>.';
    const count = await this.repositories.violations.countByUser(message.chatId, userId);
    const recent = await this.repositories.violations.listByUser(message.chatId, userId, 5);
    const lines = recent.map(
      (row) => `${row.createdAt.toISOString()} ${row.violationType} ${row.severity} ${row.action}`,
    );
    return [`Нарушений у ${userId}: ${count}`, ...lines].join('\n');
  }

  private async auditList(message: IncomingMessage): Promise<string> {
    const rows = await this.audit.listRecent(message.chatId, 20);
    if (rows.length === 0) return 'Журнал пуст.';
    return rows
      .map(
        (row) =>
          `${row.createdAt.toISOString()} ${row.action} actor=${row.actorId} target=${row.targetUserId ?? '-'} ${row.reason}`,
      )
      .join('\n')
      .slice(0, 3900);
  }

  private async purge(message: IncomingMessage, rest: string): Promise<string> {
    const count = Number(splitArgs(rest)[0]);
    if (!Number.isInteger(count) || count < 1 || count > 50)
      return 'Укажите количество от 1 до 50.';
    const settings = await this.repositories.settings.getOrCreate(message.chatId);
    if (!settings.purgeEnabled)
      return 'Массовое удаление выключено. Включите его: /config purge on';
    const membership = await this.gateway.getBotMembership(message.chatId);
    if (!hasDeletePermission(membership)) {
      return 'Нет права удалять сообщения. Назначьте боту право write в групповом чате.';
    }
    let recent;
    try {
      recent = await this.gateway.listRecentMessages(message.chatId, Math.min(count + 5, 100));
    } catch {
      return 'Не удалось получить сообщения. Проверьте, что бот администратор чата.';
    }
    let queued = 0;
    for (const item of recent) {
      if (queued >= count) break;
      if (item.messageId === message.messageId) continue;
      const result = await this.remover.remove(message.chatId, item.messageId);
      if (result.ok) queued += 1;
    }
    await this.auditAction(message, 'purge', `queued ${queued}`);
    return `В очередь удаления поставлено сообщений: ${queued}. Скорость ограничена 2 удалениями в секунду.`;
  }

  private async addFilter(
    message: IncomingMessage,
    pattern: string,
    type: FilterType,
  ): Promise<string> {
    const value = pattern.trim();
    if (!value) return 'Пустой шаблон не сохраняю.';
    if (value.length > 200) return 'Шаблон длиннее 200 символов.';
    if (type === FilterType.REGEX) {
      try {
        compileUserRegex(value);
      } catch (error) {
        if (error instanceof UnsafeRegexError)
          return `Опасный или неверный regex: ${error.message}`;
        throw error;
      }
    } else if (normalizeForWords(value).replace(/\s/g, '').length < 2) {
      return 'Слово должно содержать хотя бы 2 буквы.';
    }
    const existing = (await this.repositories.filters.list(message.chatId)).find(
      (filter) => filter.type === type && filter.pattern === value,
    );
    if (existing) return `Такой фильтр уже есть: #${existing.id}`;
    const settings = await this.repositories.settings.getOrCreate(message.chatId);
    const created = await this.repositories.filters.create({
      chatId: message.chatId,
      type,
      pattern: value,
      action: settings.defaultAction,
      severity: Severity.LOW,
      wholeWord: type === FilterType.WORD ? settings.wholeWord : false,
      createdBy: message.userId,
    });
    await this.cache.invalidate(message.chatId);
    await this.auditAction(message, 'filter_add', `${created.type} #${created.id}`);
    return `Фильтр #${created.id} добавлен: ${created.type}, действие ${created.action}, важность ${created.severity}.`;
  }

  private async removeFilter(message: IncomingMessage, rawId: string | undefined): Promise<string> {
    const id = this.parseId(rawId);
    if (id === null) return 'Укажите числовой id.';
    const removed = await this.repositories.filters.remove(message.chatId, id);
    await this.cache.invalidate(message.chatId);
    if (removed) await this.auditAction(message, 'filter_remove', `#${id}`);
    return removed ? `Фильтр #${id} удалён.` : 'Фильтр не найден в этом чате.';
  }

  private async toggleFilter(
    message: IncomingMessage,
    rawId: string | undefined,
    enabled: boolean,
  ): Promise<string> {
    const id = this.parseId(rawId);
    if (id === null) return 'Укажите числовой id.';
    const updated = await this.repositories.filters.setEnabled(message.chatId, id, enabled);
    await this.cache.invalidate(message.chatId);
    if (updated)
      await this.auditAction(message, enabled ? 'filter_enable' : 'filter_disable', `#${id}`);
    return updated
      ? `Фильтр #${id} ${enabled ? 'включён' : 'выключен'}.`
      : 'Фильтр не найден в этом чате.';
  }

  private async changeAction(
    message: IncomingMessage,
    rawId: string | undefined,
    rawAction: string | undefined,
  ): Promise<string> {
    const id = this.parseId(rawId);
    const action = rawAction ? parseAction(rawAction) : null;
    if (id === null || !action)
      return 'Формат: /filter action <id> delete|warn|mute|kick|review|notify_admins.';
    const updated = await this.repositories.filters.setAction(message.chatId, id, action);
    await this.cache.invalidate(message.chatId);
    if (updated) await this.auditAction(message, 'filter_action', `#${id} ${action}`);
    return updated ? `Фильтр #${id}: действие ${action}.` : 'Фильтр не найден в этом чате.';
  }

  private async changeSeverity(
    message: IncomingMessage,
    rawId: string | undefined,
    rawSeverity: string | undefined,
  ): Promise<string> {
    const id = this.parseId(rawId);
    const severity = rawSeverity ? parseSeverity(rawSeverity) : null;
    if (id === null || !severity) return 'Формат: /filter severity <id> low|medium|high|critical.';
    const updated = await this.repositories.filters.setSeverity(message.chatId, id, severity);
    await this.cache.invalidate(message.chatId);
    if (updated) await this.auditAction(message, 'filter_severity', `#${id} ${severity}`);
    return updated ? `Фильтр #${id}: важность ${severity}.` : 'Фильтр не найден в этом чате.';
  }

  private async beginImport(message: IncomingMessage, rest: string): Promise<string> {
    const body = rest.replace(/^import\b/i, '').trim();
    if (!body) {
      await this.kv.set(this.importKey(message), '1', 120);
      return 'Пришлите список слов следующим сообщением. Строки с # игнорируются.';
    }
    return this.importFilters(message, body);
  }

  private async importFilters(message: IncomingMessage, body: string): Promise<string> {
    const lines = body
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^["']|["']$/g, ''))
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .slice(0, 200);
    let added = 0;
    for (const line of lines) {
      const result = await this.addFilter(message, line, FilterType.WORD);
      if (result.startsWith('Фильтр #')) added += 1;
    }
    return `Импорт завершён, добавлено: ${added} из ${lines.length}.`;
  }

  private async clearFilters(
    message: IncomingMessage,
    confirm: string | undefined,
  ): Promise<string> {
    const key = `confirm:${message.chatId}:${message.userId}`;
    if (confirm !== 'confirm') {
      await this.kv.set(key, 'clear', 60);
      return 'Это удалит все словесные фильтры чата. Подтвердите: /filter clear confirm';
    }
    if ((await this.kv.get(key)) !== 'clear')
      return 'Подтверждение истекло. Снова отправьте /filter clear.';
    await this.kv.del(key);
    const removed = await this.repositories.filters.clear(message.chatId);
    await this.cache.invalidate(message.chatId);
    await this.auditAction(message, 'filter_clear', `removed ${removed}`);
    return `Удалено словесных фильтров: ${removed}. Правила ссылок не тронуты.`;
  }

  private async upsertStructural(
    message: IncomingMessage,
    kind: string,
    rawAction: string | undefined,
  ): Promise<string> {
    const action = rawAction ? parseAction(rawAction) : null;
    if (!action) return 'Укажите действие: delete, warn, review, mute, kick или notify_admins.';
    if (
      kind === 'ai' &&
      action !== ModerationAction.REVIEW &&
      action !== ModerationAction.NOTIFY_ADMINS
    ) {
      return 'AI-проверка только ставит сообщение на review или notify_admins.';
    }
    const type =
      kind === 'media'
        ? FilterType.MEDIA
        : kind === 'forward'
          ? FilterType.FORWARD
          : kind === 'caps'
            ? FilterType.CAPS
            : kind === 'flood'
              ? FilterType.FLOOD
              : kind === 'ai'
                ? FilterType.CUSTOM_AI
                : FilterType.MENTION_SPAM;
    const existing = (await this.repositories.filters.list(message.chatId)).find(
      (filter) => filter.type === type,
    );
    if (existing) {
      await this.repositories.filters.setAction(message.chatId, existing.id, action);
      await this.repositories.filters.setEnabled(message.chatId, existing.id, true);
      await this.cache.invalidate(message.chatId);
      await this.auditAction(message, 'filter_action', `${type} #${existing.id} ${action}`);
      return `Правило ${type} #${existing.id}: ${action}.`;
    }
    const created = await this.repositories.filters.create({
      chatId: message.chatId,
      type,
      pattern: '*',
      action,
      severity: Severity.MEDIUM,
      wholeWord: false,
      createdBy: message.userId,
    });
    await this.cache.invalidate(message.chatId);
    await this.auditAction(message, 'filter_add', `${type} #${created.id}`);
    return `Правило ${type} #${created.id}: ${action}.`;
  }

  private async listFilters(chatId: string): Promise<string> {
    const rows = await this.repositories.filters.list(chatId);
    if (rows.length === 0) return 'Фильтров нет. Пример: /filter add "куплю базу данных"';
    return rows
      .slice(0, 40)
      .map(
        (filter) =>
          `#${filter.id} ${filter.enabled ? 'on' : 'off'} ${filter.type} ${filter.action}/${filter.severity} ${filter.pattern.slice(0, 80)}`,
      )
      .join('\n');
  }

  private async patch(
    message: IncomingMessage,
    patch: Partial<ChatSettings>,
    name: string,
  ): Promise<string> {
    await this.repositories.settings.update(message.chatId, patch);
    await this.cache.invalidate(message.chatId);
    await this.auditAction(message, 'config_update', name);
    const settings = await this.repositories.settings.getOrCreate(message.chatId);
    return this.renderSettings(settings);
  }

  private renderSettings(settings: ChatSettings): string {
    return [
      `Чат ${settings.chatId}`,
      `модерация: ${settings.enabled ? 'вкл' : 'выкл'}`,
      `ссылки: ${settings.linkMode}`,
      `действие по умолчанию: ${settings.defaultAction}`,
      `целое слово: ${settings.wholeWord ? 'да' : 'нет'}`,
      `спам: ${settings.spamEnabled ? 'вкл' : 'выкл'}, капс: ${settings.capsEnabled ? 'вкл' : 'выкл'}`,
      `флуд: ${settings.floodMax} сообщений / ${settings.floodWindowSec} с`,
      `упоминания: до ${settings.mentionMax}`,
      `жёсткое действие critical: ${settings.hardAction}`,
      `мягкий mute: ${Math.round(settings.muteSeconds / 60)} мин`,
      `purge: ${settings.purgeEnabled ? 'вкл' : 'выкл'}`,
      `язык: ${settings.language}`,
    ].join('\n');
  }

  private async auditAction(
    message: IncomingMessage,
    action: string,
    reason: string,
    targetUserId: string | null = null,
  ): Promise<void> {
    await this.audit.record({
      chatId: message.chatId,
      actorId: message.userId,
      targetUserId,
      action,
      reason,
      metadata: { messageId: message.messageId },
    });
  }

  private async reply(message: IncomingMessage, text: string): Promise<void> {
    if (message.chatType === 'dialog') {
      await this.gateway.sendUserMessage(message.userId, text.slice(0, 4000));
      return;
    }
    await this.gateway.sendChatMessage(message.chatId, text.slice(0, 4000));
  }

  private parseId(value: string | undefined): number | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  }

  private importKey(message: IncomingMessage): string {
    return `import:${message.chatId}:${message.userId}`;
  }
}

function parseToggle(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (['on', 'true', '1', 'вкл'].includes(normalized)) return true;
  if (['off', 'false', '0', 'выкл'].includes(normalized)) return false;
  return null;
}
