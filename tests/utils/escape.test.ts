// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { escapeRegExp, escapeQuotes } from '@/utils/escape.js';

describe('escape utilities', () => {
  test('escapeRegExp escapes all regex metacharacters', () => {
    const literal = 'a.b*c?^$()[]\\{}|+';
    const escaped = escapeRegExp(literal);
    // Using the escaped value in RegExp should match the original string literally
    const re = new RegExp(escaped);

    expect(re.test(literal)).toBe(true);
  });

  test('escapeQuotes escapes double quotes', () => {
    const input = 'He said "Hello"';

    expect(escapeQuotes(input)).toBe('He said \\"Hello\\"');
  });
});
