// @ts-nocheck
import { test, expect } from '@jest/globals';
import { extractPrRefsFromText } from '@/lib/git.js';

test('extracts PR numbers and dedupes', () => {
  const text = [
    'Merge pull request #123 from feature/xyz',
    'Related to #456 and fixes #123',
    'Also mentions #789, and (#456) again.',
  ].join('\n');

  const nums = extractPrRefsFromText(text).sort((a, b) => a - b);

  expect(nums).toEqual([123, 456, 789]);
});

test('returns empty when no matches', () => {
  const text = 'no references here';

  const nums = extractPrRefsFromText(text);

  expect(nums.length).toBe(0);
});
