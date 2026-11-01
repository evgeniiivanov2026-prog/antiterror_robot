import { describe, expect, it } from 'vitest';
import { ModerationAction, Severity } from '../src/domain/enums.js';
import { resolveEffects } from '../src/moderation/effects.js';

describe('severity effects', () => {
  it('keeps low deletions quiet and escalates higher severities', () => {
    expect(resolveEffects(ModerationAction.DELETE, Severity.LOW, ModerationAction.KICK)).toEqual({
      delete: true,
      warn: false,
      mute: false,
      kick: false,
      notify: false,
      review: false,
    });
    expect(
      resolveEffects(ModerationAction.DELETE, Severity.MEDIUM, ModerationAction.KICK).warn,
    ).toBe(true);
    expect(
      resolveEffects(ModerationAction.DELETE, Severity.HIGH, ModerationAction.KICK).notify,
    ).toBe(true);
    const critical = resolveEffects(
      ModerationAction.DELETE,
      Severity.CRITICAL,
      ModerationAction.KICK,
    );
    expect(critical.delete && critical.notify && critical.kick).toBe(true);
  });

  it('does not delete when the rule action is review', () => {
    const effects = resolveEffects(ModerationAction.REVIEW, Severity.HIGH, ModerationAction.KICK);
    expect(effects.delete).toBe(false);
    expect(effects.review).toBe(true);
    expect(effects.kick).toBe(false);
  });
});
