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

  test('does not modify when Breaking Changes is already at the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(markdown);
  });

  test('moves Breaking Changes in the middle to the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });

  test('moves Breaking Changes at the end to the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });

  test('consolidates multiple Breaking Changes sections at the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
      '### Breaking Changes',
      '',
      '- Drop old config format',
      '',
      '### Chore',
      '',
      '- Adjust scripts',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '- Drop old config format',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
      '### Chore',
      '',
      '- Adjust scripts',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });

  test('does not move an empty Breaking Changes section', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Breaking Changes',
      '',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out.indexOf('### Added')).toBeLessThan(
      out.indexOf('### Breaking Changes'),
    );
    expect(out.indexOf('### Breaking Changes')).toBeLessThan(
      out.indexOf('### Fixed'),
    );
    const breakingSection = extractSection(out, 'Breaking Changes');
    expect(breakingSection).not.toMatch(/^\s*-\s+/m);
  });

  test('does not modify when Breaking Changes is absent', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(markdown);
  });

  test('consolidates multiple Breaking Changes sections already at the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Breaking Changes',
      '',
      '- Drop old config format',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '- Drop old config format',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });
});
