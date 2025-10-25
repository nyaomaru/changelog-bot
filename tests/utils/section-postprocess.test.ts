// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { postprocessSection } from '@/utils/section-postprocess.js';

describe('section-postprocess', () => {
  test('removes merged PRs and attaches missing PR numbers', () => {
    const input = [
      '## [v1.0.0] - 2024-01-01',
      '',
      '### Added',
      '- Add Login',
      '',
      '### Merged PRs',
      '- Merge pull request #1 from foo',
      '',
    ].join('\n');
    const titleToPr = { 'Add Login': 123 };

    const out = postprocessSection(input, titleToPr);

    expect(out).toContain('- Add Login (#123)');
    expect(out).not.toContain('### Merged PRs');
  });
});
