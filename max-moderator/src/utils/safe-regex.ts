const MAX_PATTERN_LENGTH = 200;
const MAX_INPUT_LENGTH = 4000;

export class UnsafeRegexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRegexError';
  }
}

function stripClasses(pattern: string): string {
  return pattern.replace(/\\./g, '').replace(/\[[^\]]*\]/g, 'a');
}

export function assertSafeRegex(pattern: string): void {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) {
    throw new UnsafeRegexError('Regex length must be from 1 to 200 characters');
  }
  if (pattern.includes('\0')) throw new UnsafeRegexError('Regex contains a forbidden character');
  if (/\\[1-9]/.test(pattern)) throw new UnsafeRegexError('Backreferences are not allowed');
  if (/\(\?[=!<]/.test(pattern)) throw new UnsafeRegexError('Lookaround is not allowed');
  const stripped = stripClasses(pattern);
  if (/([+*]|\{\d+,?\d*\})\s*\)?\s*([+*]|\{\d+,?\d*\})/.test(stripped)) {
    throw new UnsafeRegexError('Nested quantifiers are not allowed');
  }
  if (/\((?:[^()]|\\.){0,200}[+*](?:[^()]|\\.){0,200}\)[+*{]/.test(stripped)) {
    throw new UnsafeRegexError('Quantified groups are not allowed');
  }
  try {
    new RegExp(pattern, 'u');
  } catch {
    throw new UnsafeRegexError('Regex does not compile');
  }
}

export function compileUserRegex(pattern: string): RegExp {
  assertSafeRegex(pattern);
  return new RegExp(pattern, 'iu');
}

export function execUserRegex(regex: RegExp, input: string): boolean {
  const sample = input.slice(0, MAX_INPUT_LENGTH);
  regex.lastIndex = 0;
  const started = Date.now();
  const matched = regex.test(sample);
  if (Date.now() - started > 25) {
    throw new UnsafeRegexError('Regex exceeded the execution budget');
  }
  return matched;
}
