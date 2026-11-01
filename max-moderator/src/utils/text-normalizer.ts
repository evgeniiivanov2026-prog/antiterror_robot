const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00AD]/g;

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: 'а',
  c: 'с',
  e: 'е',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у',
  k: 'к',
  m: 'м',
  t: 'т',
  h: 'н',
  b: 'в',
};

const LEET: Record<string, string> = {
  '0': 'о',
  '1': 'и',
  '3': 'е',
  '4': 'а',
  '5': 'с',
  '6': 'б',
  '7': 'т',
  '@': 'а',
  $: 'с',
};

export function stripNoise(input: string): string {
  return input.normalize('NFKC').replace(ZERO_WIDTH, '').replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}

export function normalizeForRegex(input: string): string {
  return stripNoise(input).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeForWords(input: string): string {
  const folded = normalizeForRegex(input);
  let output = '';
  for (const char of folded) {
    output += LATIN_TO_CYRILLIC[char] ?? LEET[char] ?? char;
  }
  return output;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildFlexiblePattern(normalized: string, wholeWord: boolean): string {
  const chars = [...normalized];
  let body = '';
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (!char) continue;
    if (/\s/u.test(char)) {
      body += '[^\\p{L}\\p{N}]{1,3}';
      continue;
    }
    body += `${escapeRegex(char)}+`;
    const next = chars[index + 1];
    if (next && !/\s/u.test(next)) body += '[^\\p{L}\\p{N}]{0,2}';
  }
  if (!wholeWord) return body;
  return `(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`;
}

export function capsStats(input: string): { letters: number; ratio: number } {
  let letters = 0;
  let upper = 0;
  for (const char of input) {
    if (!/\p{L}/u.test(char)) continue;
    letters += 1;
    const lower = char.toLowerCase();
    const upperChar = char.toUpperCase();
    if (char === upperChar && char !== lower) upper += 1;
  }
  return { letters, ratio: letters === 0 ? 0 : upper / letters };
}
