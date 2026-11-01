const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

/**
 * Visually similar letters and digits are folded to a Latin skeleton so that
 * homoglyphs and leet substitutions compare equal on both the message and the pattern.
 * Digits inside a pure number are left untouched.
 */
const TO_LATIN: Record<string, string> = {
  а: 'a',
  е: 'e',
  ё: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  к: 'k',
  м: 'm',
  т: 't',
  н: 'h',
  в: 'b',
  і: 'i',
  ї: 'i',
  α: 'a',
  ο: 'o',
  ε: 'e',
  ρ: 'p',
  υ: 'y',
  κ: 'k',
  τ: 't',
  ν: 'h',
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'b',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
};

const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;

export function foldText(input: string): string {
  const cleaned = input.normalize('NFKC').replace(INVISIBLE, '').toLowerCase();
  const chars = [...cleaned];
  let out = '';
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index] ?? '';
    const prev = chars[index - 1] ?? '';
    const next = chars[index + 1] ?? '';
    const digit = DIGIT.test(ch);
    if (digit && !LETTER.test(prev) && !LETTER.test(next)) {
      out += ch;
      continue;
    }
    out += TO_LATIN[ch] ?? ch;
  }
  return out
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a word or phrase after folding.
 * Separators (`*`, spaces, punctuation) and repeated letters are ignored.
 * `wholeWord` refuses a hit when the match is only part of a longer word.
 */
export function matchesPattern(text: string, pattern: string, wholeWord: boolean): boolean {
  const foldedText = foldText(text);
  const foldedPattern = foldText(pattern);
  const words = foldedPattern.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const pieces: string[] = [];
  for (const word of words) {
    const letters = [...word].filter((ch) => LETTER.test(ch) || DIGIT.test(ch));
    if (letters.length === 0) return false;
    pieces.push(letters.map((ch) => `${escapeRegex(ch)}+`).join('[^\\p{L}\\p{N}]*'));
  }

  const body = pieces.join('[^\\p{L}\\p{N}]+');
  const prefix = wholeWord ? '(?<![\\p{L}\\p{N}])' : '';
  const suffix = wholeWord ? '(?![\\p{L}\\p{N}])' : '';
  const expression = new RegExp(`${prefix}${body}${suffix}`, 'iu');
  return expression.test(foldedText);
}

export function capsRatio(text: string): { ratio: number; letters: number } {
  const chars = [...text.normalize('NFKC')];
  let letters = 0;
  let upper = 0;
  for (const ch of chars) {
    if (!LETTER.test(ch)) continue;
    letters += 1;
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper += 1;
  }
  return { ratio: letters === 0 ? 0 : upper / letters, letters };
}

export function countMentions(text: string): number {
  const matches = text.match(/@[\p{L}\p{N}_]{2,}/gu);
  return matches?.length ?? 0;
}
