import { Decision, ModerationAction, Severity } from '../domain/enums.js';
import type { FilterHit, ModerationDecision } from '../domain/messages.js';
import type { ChatSettings } from '../domain/models.js';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  [Severity.LOW]: 1,
  [Severity.MEDIUM]: 2,
  [Severity.HIGH]: 3,
  [Severity.CRITICAL]: 4,
};

const ACTION_WEIGHT: Record<ModerationAction, number> = {
  [ModerationAction.NOTIFY_ADMINS]: 1,
  [ModerationAction.REVIEW]: 2,
  [ModerationAction.WARN]: 3,
  [ModerationAction.DELETE]: 4,
  [ModerationAction.MUTE]: 5,
  [ModerationAction.KICK]: 6,
};

export function allowDecision(reason?: string): ModerationDecision {
  return {
    decision: Decision.ALLOW,
    hits: [],
    primary: null,
    deleteMessage: false,
    warnUser: false,
    notifyAdmins: false,
    hardAction: null,
    ...(reason ? { skippedReason: reason } : {}),
  };
}

export function choosePrimary(hits: FilterHit[]): FilterHit | null {
  let best: FilterHit | null = null;
  let bestScore = -1;
  for (const hit of hits) {
    const score = SEVERITY_WEIGHT[hit.severity] * 10 + ACTION_WEIGHT[hit.action];
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

function toDecision(action: ModerationAction): Decision {
  switch (action) {
    case ModerationAction.DELETE:
      return Decision.DELETE;
    case ModerationAction.WARN:
      return Decision.WARN;
    case ModerationAction.MUTE:
      return Decision.MUTE;
    case ModerationAction.KICK:
      return Decision.KICK;
    case ModerationAction.REVIEW:
      return Decision.REVIEW;
    case ModerationAction.NOTIFY_ADMINS:
      return Decision.NOTIFY_ADMINS;
    default:
      return Decision.ALLOW;
  }
}

/**
 * Explicit rule action wins over the severity ladder when the admin chose
 * warn, review, or notify. Severity still adds a private warning, an admin
 * notice, or the chat's hard action for delete/mute/kick.
 */
export function finalizeDecision(hits: FilterHit[], settings: ChatSettings): ModerationDecision {
  const primary = choosePrimary(hits);
  if (!primary) return allowDecision();

  const decision = toDecision(primary.action);
  let deleteMessage = false;
  let warnUser = false;
  let notifyAdmins = false;
  let hardAction: ModerationAction | null = null;

  const removes =
    primary.action === ModerationAction.DELETE ||
    primary.action === ModerationAction.MUTE ||
    primary.action === ModerationAction.KICK;

  if (primary.action === ModerationAction.WARN) warnUser = true;
  if (
    primary.action === ModerationAction.REVIEW ||
    primary.action === ModerationAction.NOTIFY_ADMINS
  ) {
    notifyAdmins = true;
  }

  if (removes) {
    deleteMessage = true;
    if (primary.severity === Severity.MEDIUM) warnUser = true;
    if (primary.severity === Severity.HIGH || primary.severity === Severity.CRITICAL)
      notifyAdmins = true;
    if (primary.severity === Severity.CRITICAL && settings.hardAction !== primary.action) {
      hardAction = settings.hardAction;
    }
  } else if (primary.severity === Severity.HIGH || primary.severity === Severity.CRITICAL) {
    notifyAdmins = true;
  }

  return {
    decision,
    hits,
    primary,
    deleteMessage,
    warnUser,
    notifyAdmins,
    hardAction,
  };
}
