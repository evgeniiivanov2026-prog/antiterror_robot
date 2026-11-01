const MAX_PATTERN_LENGTH = 200;
const MAX_SUBJECT_LENGTH = 2_000;

export class UnsafeRegexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRegexError';
  }
}

/**
 * Reject patterns that are empty, too long, or shaped like catastrophic backtracking.
 * JavaScript cannot preempt a running regular expression, so the guard is the pattern shape
 * plus a hard subject-length cap.
 */
export function compileUserRegex(pattern: string): RegExp {
  const source = pattern.trim();
  if (source.length === 0) throw new UnsafeRegexError('Пустой шаблон');
  if (source.length > MAX_PATTERN_LENGTH) {
    throw new UnsafeRegexError(`Шаблон длиннее ${MAX_PATTERN_LENGTH} символов`);
  }
  if (isDangerous(source)) {
    throw new UnsafeRegexError('Шаблон отклонён: возможный ReDoS');
  }
  try {
    return new RegExp(source, 'iu');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid regex';
    throw new UnsafeRegexError(`Шаблон не компилируется: ${message}`);
  }
}

export function testUserRegex(expression: RegExp, subject: string): boolean {
  const limited = subject.slice(0, MAX_SUBJECT_LENGTH);
  return expression.test(limited);
}

function isDangerous(source: string): boolean {
  if (/\\[1-9]/.test(source) && /(\([^)]*[+*][^)]*\))[+*{]/.test(source)) return true;
  const nested = [
    /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/,
    /\((?:[^()\\]|\\.)*\{[0-9]+,\}(?:[^()\\]|\\.)*\)[+*{]/,
    /(\.\*){2,}/,
    /(\.\+){2,}/,
    /\([^)]*[|+][^)]*\)[+*{]/,
  ];
  return nested.some((expression) => expression.test(source));
}
