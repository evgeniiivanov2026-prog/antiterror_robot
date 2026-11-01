import { describe, expect, it } from 'vitest';
import { matchesTerm, normalizeText } from '../src/utils/text-normalizer.js';

describe('text normalizer', () => {
  it('maps homoglyphs, leet digits and repeated characters', () => {
    expect(normalizeText('C0В0')).toBe('сово');
    expect(matchesTerm('слооово', 'слово', true)).toBe(true);
    expect(matchesTerm('cлoво', 'слово', true)).toBe(true);
  });

  it('matches spaced letters, mask separators and a single masked letter', () => {
    expect(matchesTerm('с о в о', 'сово', true)).toBe(true);
    expect(matchesTerm('с*ово', 'сово', true)).toBe(true);
    expect(matchesTerm('с0в0', 'сово', true)).toBe(true);
    expect(matchesTerm('с*ово', 'слово', true)).toBe(true);
  });

  it('respects wholeWord', () => {
    expect(matchesTerm('словоформа', 'слово', true)).toBe(false);
    expect(matchesTerm('словоформа', 'слово', false)).toBe(true);
    expect(matchesTerm('это слово тут', 'слово', true)).toBe(true);
  });
});
