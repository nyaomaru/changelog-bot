import { describe, expect, test } from '@jest/globals';
import {
  appendUniqueBulletLines,
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';

describe('markdown-sections utils', () => {
  test('splits and renders H3 sections without changing content', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const document = splitMarkdownSections(markdown);

    expect(document.preamble).toEqual(['## [v1.2.3] - 2025-01-01', '']);
    expect(document.sections.map((section) => section.name)).toEqual([
      'Added',
      'Fixed',
    ]);
    expect(renderMarkdownSections(document)).toBe(markdown);
  });

  test('appends only unique bullet lines and preserves blank-line framing', () => {
    const document = splitMarkdownSections(
      ['### Chore', '', '- Update lockfile', ''].join('\n'),
    );
    const [section] = document.sections;

    appendUniqueBulletLines(section, ['- Update lockfile', '- Bump eslint']);

    expect(section.lines).toEqual([
      '',
      '- Update lockfile',
      '- Bump eslint',
      '',
    ]);
  });
});
