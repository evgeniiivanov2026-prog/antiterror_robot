import { ModerationAction, Severity } from '../domain/enums.js';
import type { Effects } from '../domain/types.js';

export function emptyEffects(): Effects {
  return { delete: false, warn: false, mute: false, kick: false, notify: false, review: false };
}

export function resolveEffects(
  action: ModerationAction,
  severity: Severity,
  hardAction: ModerationAction,
): Effects {
  const effects = emptyEffects();
  switch (action) {
    case ModerationAction.DELETE:
      effects.delete = true;
      break;
    case ModerationAction.WARN:
      effects.delete = true;
      effects.warn = true;
      break;
    case ModerationAction.MUTE:
      effects.delete = true;
      effects.mute = true;
      break;
    case ModerationAction.KICK:
      effects.delete = true;
      effects.kick = true;
      break;
    case ModerationAction.NOTIFY_ADMINS:
      effects.notify = true;
      break;
    case ModerationAction.REVIEW:
      effects.review = true;
      effects.notify = true;
      break;
    default:
      break;
  }
  if (!effects.delete) return effects;
  if (severity === Severity.MEDIUM) effects.warn = true;
  if (severity === Severity.HIGH || severity === Severity.CRITICAL) effects.notify = true;
  if (severity === Severity.CRITICAL) {
    if (hardAction === ModerationAction.KICK) effects.kick = true;
    if (hardAction === ModerationAction.MUTE) effects.mute = true;
    effects.notify = true;
  }
  if (severity === Severity.LOW && action === ModerationAction.DELETE) {
    effects.warn = false;
    effects.notify = false;
  }
  return effects;
}
