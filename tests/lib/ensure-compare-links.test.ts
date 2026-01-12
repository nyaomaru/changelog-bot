// @ts-nocheck
import { test, expect } from '@jest/globals';
import { ensureCompareLinks } from '@/lib/changelog.js';
import { HEAD_REF } from '@/constants/git.js';

test('creates compare link for HEAD release', () => {
  const { compareLine, unreleasedLine } = ensureCompareLinks({
    owner: 'foo',
    repo: 'bar',
    prevTag: 'v0.1.0',
    releaseRef: HEAD_REF,
    version: '0.2.0',
    existing: '',
  });

  expect(compareLine).toBe(
    '[v0.2.0]: https://github.com/foo/bar/compare/v0.1.0...HEAD',
  );
  expect(unreleasedLine).toBeUndefined();
});
