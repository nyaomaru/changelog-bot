// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { removeMergedPRs } from '@/utils/remove-merged-prs.js';

describe('removeMergedPRs', () => {
  test('removes the Merged PRs section and keeps others intact', () => {
    const input = [
      '### Added',
      '- Add feature',
      '',
      '### Merged PRs',
      '- Some merged PR detail',
      '- Another line',
      '',
      '### Fixed',
      '- Fix bug',
      '',
    ].join('\n');

    const out = removeMergedPRs(input);

    expect(out).toContain('### Added');
    expect(out).toContain('### Fixed');
    expect(out).not.toContain('### Merged PRs');
    expect(out).not.toContain('Some merged PR detail');
  });
});
