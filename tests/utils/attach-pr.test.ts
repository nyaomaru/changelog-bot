// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { attachPrNumbers } from '@/utils/attach-pr.js';

describe('attachPrNumbers', () => {
  test('adds PR reference when missing', () => {
    const md = ['### Added', '- Add feature', ''].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    expect(out).toContain('- Add feature (#42)');
  });

  test('does not duplicate existing PR references', () => {
    const md = ['### Added', '- Add feature (#42)', ''].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    expect(out.match(/#42/g)?.length).toBe(1);
  });

  test('matches normalized titles with conventional prefixes', () => {
    const md = ['### Added', '- feat: Add feature', ''].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 99 });

    expect(out).toContain('- feat: Add feature (#99)');
  });
});
