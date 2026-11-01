const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g;
const MASKS = new Set(['*', '_', '~', '.', '-', '•', '·']);

const CONFUSABLES: Record<string, string> = {
  a: 'а',
  e: 'е',
  o: 'о',
  p: 'р',
  c: 'с',
  y: 'у',
  x: 'х',
  k: 'к',
  '0': 'о',
  '3': 'е',
  '4': 'а',
  '@': 'а',
  $: 'с',
  ё: 'е',
};

export function normalizeText(input: string): string {
  const folded = input.normalize('NFKC').replace(ZERO_WIDTH, '').toLocaleLowerCase('ru');
  let mapped = '';
  for (const char of folded) {
    mapped += CONFUSABLES[char] ?? char;
  }
  return mapped
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export function squashRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/gu, '$1');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesTerm(haystack: string, needle: string, wholeWord: boolean): boolean {
  if (!needle || !haystack) return false;
  if (!wholeWord) return haystack.includes(needle);
  const source = `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`;
  return new RegExp(source, 'u').test(haystack);
}

function stripMasks(token: string): string {
  let result = '';
  for (const char of token) {
    if (!MASKS.has(char)) result += char;
  }
  return result;
}

function oneMaskEquals(token: string, needle: string): boolean {
  let masks = 0;
  for (const char of token) {
    if (MASKS.has(char)) masks += 1;
  }
  if (masks !== 1) return false;
  const stripped = stripMasks(token);
  if ([...stripped].length !== [...needle].length - 1) return false;
  const needleChars = [...needle];
  const strippedChars = [...stripped];
  let skips = 0;
  let index = 0;
  for (const char of needleChars) {
    if (strippedChars[index] === char) {
      index += 1;
    } else {
      skips += 1;
      if (skips > 1) return false;
    }
  }
  return skips === 1 && index === strippedChars.length;
}

function reassemble(text: string): string {
  const pieces = text.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let run = '';
  const flush = () => {
    if (run) parts.push(run);
    run = '';
  };
  for (const piece of pieces) {
    const bare = stripMasks(piece);
    if ([...bare].length <= 1) {
      run += bare;
    } else {
      flush();
      parts.push(bare);
    }
  }
  flush();
  return parts.join(' ');
}

export function matchesTerm(text: string, pattern: string, wholeWord: boolean): boolean {
  const haystack = squashRepeats(normalizeText(text));
  const needle = squashRepeats(normalizeText(pattern));
  if ([...needle].length < 2) return false;
  if (includesTerm(haystack, needle, wholeWord)) return true;

  const collapsed = reassemble(haystack);
  if (collapsed !== haystack && includesTerm(collapsed, needle, wholeWord)) return true;

  for (const piece of haystack.split(/\s+/)) {
    if (oneMaskEquals(piece, needle)) return true;
    const bare = stripMasks(piece);
    if (bare !== piece && includesTerm(bare, needle, wholeWord)) return true;
  }
  return false;
}

export function letterStats(text: string): { letters: number; upper: number; length: number } {
  const sample = text.normalize('NFKC');
  let letters = 0;
  let upper = 0;
  for (const char of sample) {
    if (/\p{L}/u.test(char)) {
      letters += 1;
      if (char === char.toLocaleUpperCase('ru') && char !== char.toLocaleLowerCase('ru')) {
        upper += 1;
      }
    }
  }
  return { letters, upper, length: [...sample].length };
}
