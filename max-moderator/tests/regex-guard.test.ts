import { describe, expect, it } from 'vitest';
import { UnsafeRegexError, compileUserRegex, testUserRegex } from '../src/utils/regex-guard.js';

describe('regex guard', () => {
  it('compiles a bounded pattern and matches text', () => {
    expect(testUserRegex('\\bspam\\b', 'buy spam now')).toBe(true);
    expect(testUserRegex('\\bspam\\b', 'spammer')).toBe(false);
  });

  it('rejects nested quantifiers and overlong patterns', () => {
    expect(() => compileUserRegex('(a+)+')).toThrow(UnsafeRegexError);
    expect(() => compileUserRegex('a'.repeat(129))).toThrow(UnsafeRegexError);
    expect(() => compileUserRegex('(a)\\1')).toThrow(UnsafeRegexError);
  });
});
