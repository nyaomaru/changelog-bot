import { describe, expect, test } from '@jest/globals';
import { postprocessSection } from '@/utils/section-postprocess.js';

function extractSection(md: string, heading: string): string {
  const pattern = new RegExp(`###\\s+${heading}[\\s\\S]*?(?=###\\s+|$)`, 'i');
  const match = md.match(pattern);
  return match ? match[0] : '';
}

describe('postprocessSection', () => {
  test('moves dependency update bullets from Changed to Chore', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Changed',
      '',
      '- chore(deps): Update dependency prettier to v3.8.0',
      '- Refactor core pipeline',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});
    const changedSection = extractSection(out, 'Changed');
    const choreSection = extractSection(out, 'Chore');

    expect(changedSection).toContain('- Refactor core pipeline');
    expect(changedSection).not.toContain(
      'chore(deps): Update dependency prettier to v3.8.0',
    );
    expect(choreSection).toContain(
      '- chore(deps): Update dependency prettier to v3.8.0',
    );
  });
});
