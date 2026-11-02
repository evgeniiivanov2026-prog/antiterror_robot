import { Severity, severityRank } from './severity.js';
import {
  ModerationAction,
  type ChatSettings,
  type FilterHit,
  type ModerationPlan,
} from './types.js';

const ACTION_RANK: Record<ModerationAction, number> = {
  [ModerationAction.KICK]: 60,
  [ModerationAction.MUTE]: 50,
  [ModerationAction.DELETE]: 40,
  [ModerationAction.WARN]: 30,
  [ModerationAction.REVIEW]: 20,
  [ModerationAction.NOTIFY_ADMINS]: 10,
};

function compareHits(left: FilterHit, right: FilterHit): number {
  const actionDelta = ACTION_RANK[right.action] - ACTION_RANK[left.action];
  if (actionDelta !== 0) return actionDelta;
  return severityRank(right.severity) - severityRank(left.severity);
}

export function planFromHits(hits: FilterHit[], settings: ChatSettings): ModerationPlan | null {
  if (hits.length === 0) return null;
  const ordered = [...hits].sort(compareHits);
  const primary = ordered[0];
  if (!primary) return null;
  const maxSeverity = hits.reduce(
    (current, hit) => (severityRank(hit.severity) > severityRank(current) ? hit.severity : current),
    primary.severity,
  );

  if (primary.action === ModerationAction.REVIEW) {
    return {
      decision: 'REVIEW',
      severity: maxSeverity,
      reason: primary.reason,
      ...(primary.ruleId !== undefined ? { ruleId: primary.ruleId } : {}),
      violationType: primary.type,
      deleteMessage: false,
      warnUser: false,
      notifyAdmins: true,
      mute: false,
      kick: false,
    };
  }

  let decision: ModerationPlan['decision'] =
    primary.action === ModerationAction.NOTIFY_ADMINS ? 'NOTIFY_ADMINS' : primary.action;
  let deleteMessage = decision === 'DELETE' || decision === 'MUTE' || decision === 'KICK';
  let warnUser = decision === 'WARN' || decision === 'MUTE';
  let notifyAdmins = decision === 'NOTIFY_ADMINS';
  let mute = decision === 'MUTE';
  let kick = decision === 'KICK';

  if (deleteMessage || decision === 'WARN') {
    if (severityRank(maxSeverity) >= severityRank(Severity.MEDIUM)) warnUser = true;
    if (severityRank(maxSeverity) >= severityRank(Severity.HIGH)) notifyAdmins = true;
    if (maxSeverity === Severity.CRITICAL) {
      if (settings.hardAction === 'kick') {
        kick = true;
        deleteMessage = true;
        decision = 'KICK';
      } else if (settings.hardAction === 'mute') {
        mute = true;
        deleteMessage = true;
        decision = 'MUTE';
      }
    }
  }

  return {
    decision,
    severity: maxSeverity,
    reason: primary.reason,
    ...(primary.ruleId !== undefined ? { ruleId: primary.ruleId } : {}),
    violationType: primary.type,
    deleteMessage,
    warnUser,
    notifyAdmins,
    mute,
    kick,
  };
}
