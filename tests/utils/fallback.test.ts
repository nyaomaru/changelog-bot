// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { fallbackSection } from '@/utils/fallback.js';

describe('fallbackSection', () => {
  test('groups commits by conventional prefix and formats bullets', () => {
    const logs = [
      // short sha + subject
      'abc1234 feat: Add amazing feature',
      'def5678 fix(scope): Correct bug',
      '9876abc docs: Improve README',
    ].join('\n');

    const md = fallbackSection({
      version: '0.2.0',
      date: '2024-01-02',
      logs,
      prs: '',
      prMapBySha: {
        abc1234: [101],
        def5678: [202],
      },
    });

    expect(md).toContain('## [v0.2.0] - 2024-01-02');
    expect(md).toContain('### Added');
    expect(md).toContain('### Fixed');
    expect(md).toContain('### Docs');
    expect(md).toContain('- Add amazing feature (#101)');
    expect(md).toContain('- Correct bug (#202)');
  });
});
