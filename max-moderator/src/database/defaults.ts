import type { AppEnv } from '../config/env.js';
import type { ChatSettings } from '../moderation/types.js';

export function defaultChatSettings(
  chatId: string,
  defaults: Pick<AppEnv, 'defaultLinkMode' | 'defaultWordAction'>,
  now = new Date(),
): ChatSettings {
  return {
    chatId,
    linkMode: defaults.defaultLinkMode,
    defaultAction: defaults.defaultWordAction,
    language: 'ru',
    enabled: true,
    wholeWord: true,
    purgeEnabled: false,
    spamEnabled: true,
    capsEnabled: true,
    hardAction: 'none',
    capsRatio: 0.7,
    capsMinLength: 20,
    floodMax: 5,
    floodWindowSec: 10,
    mentionMax: 5,
    duplicateThreshold: 3,
    muteSeconds: 600,
    createdAt: now,
    updatedAt: now,
  };
}
