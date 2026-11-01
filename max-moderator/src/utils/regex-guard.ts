const MAX_PATTERN_LENGTH = 128;
const MAX_TEXT_LENGTH = 2000;

export class UnsafeRegexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRegexError';
  }
}

function hasNestedQuantifier(source: string): boolean {
  return /(?:\([^()]*(?:[+*]|\{\d+,?\d*\})[^()]*\))[+*?]/.test(source);
}

export function compileUserRegex(source: string): RegExp {
  const pattern = source.trim();
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) {
    throw new UnsafeRegexError('Длина regex должна быть от 1 до 128 символов');
  }
  if (/\\[1-9]/.test(pattern) || /\\k</.test(pattern)) {
    throw new UnsafeRegexError('Обратные ссылки запрещены');
  }
  if (/\(\?(?!:)/.test(pattern)) {
    throw new UnsafeRegexError('Группы (?...) кроме (?: ) запрещены');
  }
  if (hasNestedQuantifier(pattern)) {
    throw new UnsafeRegexError('Вложенные квантификаторы запрещены');
  }
  const quantifiers = pattern.match(/[+*{]/g);
  if ((quantifiers?.length ?? 0) > 8) {
    throw new UnsafeRegexError('Слишком много квантификаторов');
  }
  try {
    return new RegExp(pattern, 'iu');
  } catch {
    throw new UnsafeRegexError('Regex не компилируется');
  }
}

const compiled = new Map<string, RegExp>();

export function testUserRegex(pattern: string, text: string): boolean {
  let expression = compiled.get(pattern);
  if (!expression) {
    expression = compileUserRegex(pattern);
    if (compiled.size > 500) compiled.clear();
    compiled.set(pattern, expression);
  }
  expression.lastIndex = 0;
  return expression.test(text.slice(0, MAX_TEXT_LENGTH));
}
