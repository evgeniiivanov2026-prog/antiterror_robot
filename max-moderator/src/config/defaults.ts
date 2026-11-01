import { LinkMode, ModerationAction } from '../domain/enums.js';
import type { ChatSettings } from '../domain/models.js';

export function defaultChatSettings(
  chatId: string,
  defaults: { linkMode: LinkMode; wordAction: ModerationAction },
  now = new Date(),
): ChatSettings {
  return {
    chatId,
    linkMode: defaults.linkMode,
    defaultAction: defaults.wordAction,
    language: 'ru',
    enabled: true,
    wholeWord: true,
    purgeEnabled: false,
    hardAction: ModerationAction.NOTIFY_ADMINS,
    capsRatio: 0.7,
    capsMinLength: 20,
    floodLimit: 8,
    floodWindowMs: 10_000,
    repeatLimit: 3,
    mentionLimit: 5,
    moderateCaps: true,
    moderateFlood: true,
    moderateMentions: true,
    moderateMedia: false,
    moderateForwards: false,
    lexiconSeeded: false,
    createdAt: now,
    updatedAt: now,
  };
}
