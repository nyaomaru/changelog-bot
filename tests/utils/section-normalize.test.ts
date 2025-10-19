// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { normalizeSectionCategories } from '@/utils/section-normalize.js';

describe('normalizeSectionCategories', () => {
  test('adds v prefix to release header and normalizes categories', () => {
    const input = [
      '## [1.2.3] - 2024-01-01',
      '',
      '### docs',
      '- Update docs',
      '',
      '### add',
      '- Add feature',
      '',
    ].join('\n');

    const out = normalizeSectionCategories(input);

    expect(out).toContain('## [v1.2.3] - 2024-01-01');
    expect(out).toContain('### Docs');
    expect(out).toContain('### Added');
  });
});
