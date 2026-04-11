// @ts-nocheck
import { test, expect } from '@jest/globals';
import { finalizeChangelogUpdate } from '@/lib/changelog-update.js';

test('finalizes a generated section with compare links and full changelog url', () => {
  const result = finalizeChangelogUpdate({
    owner: 'octo',
    repo: 'repo',
    version: '1.1.0',
    prevRef: 'v1.0.0',
    releaseRef: 'v1.1.0',
    existing: ['# Changelog', '', '## [Unreleased]', ''].join('\n'),
    llm: {
      new_section_markdown: [
        '## [v1.1.0] - 2026-04-10',
        '',
        '### Added',
        '- feature',
      ].join('\n'),
      insert_after_anchor: '## [Unreleased]',
      pr_title: 'docs(changelog): v1.1.0',
      pr_body: 'body',
    },
    titleToPr: {},
  });

  expect(result.llm.new_section_markdown).toContain(
    '[v1.1.0]: https://github.com/octo/repo/compare/v1.0.0...v1.1.0',
  );
  expect(result.llm.new_section_markdown).toContain(
    '**Full Changelog**: https://github.com/octo/repo/compare/v1.0.0...v1.1.0',
  );
  expect(result.updated).toContain('## [v1.1.0] - 2026-04-10');
});
