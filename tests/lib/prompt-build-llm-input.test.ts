// @ts-nocheck
import { test, expect } from '@jest/globals';
import { buildLLMInput } from '@/lib/prompt.js';
import { CHANGELOG_PREVIEW_LIMIT } from '@/constants/prompt.js';

test('buildLLMInput truncates changelog to preview limit and maps fields', () => {
  const longChangelog = 'x'.repeat(CHANGELOG_PREVIEW_LIMIT + 50);

  const input = buildLLMInput({
    repo: 'owner/repo',
    version: '1.2.3',
    date: '2024-01-02',
    releaseTag: 'v1.2.3',
    prevTag: 'v1.2.2',
    releaseBody: 'release body',
    gitLog: 'abc Fix: something',
    mergedPRs: '- #123 Some PR',
    changelog: longChangelog,
    language: 'ja',
    customInstructions: 'Write concise user-facing bullets.',
  });

  expect(input.repo).toBe('owner/repo');
  expect(input.version).toBe('1.2.3');
  expect(input.date).toBe('2024-01-02');
  expect(input.releaseTag).toBe('v1.2.3');
  expect(input.prevTag).toBe('v1.2.2');
  expect(input.releaseBody).toBe('release body');
  expect(input.gitLog).toBe('abc Fix: something');
  expect(input.mergedPRs).toBe('- #123 Some PR');
  expect(input.language).toBe('ja');
  expect(input.customInstructions).toBe('Write concise user-facing bullets.');
  expect(input.changelogPreview.length).toBe(CHANGELOG_PREVIEW_LIMIT);
});

test('buildLLMInput matches provider prompt golden shape', () => {
  expect(
    buildLLMInput({
      repo: 'octo/repo',
      version: '1.2.3',
      date: '2026-06-07',
      releaseTag: 'v1.2.3',
      prevTag: 'v1.2.2',
      releaseBody: "## What's Changed\n- Add JSON report",
      gitLog: 'abcdef1 feat: add dry-run JSON report (#123)',
      mergedPRs: '- #123 Add JSON report @nyaomaru',
      changelog: '# Changelog\n\n## [Unreleased]\n',
      language: 'en',
      customInstructions: 'Keep bullets concise.',
    }),
  ).toMatchInlineSnapshot(`
{
  "changelogPreview": "# Changelog

## [Unreleased]
",
  "customInstructions": "Keep bullets concise.",
  "date": "2026-06-07",
  "gitLog": "abcdef1 feat: add dry-run JSON report (#123)",
  "language": "en",
  "mergedPRs": "- #123 Add JSON report @nyaomaru",
  "prevTag": "v1.2.2",
  "releaseBody": "## What's Changed
- Add JSON report",
  "releaseTag": "v1.2.3",
  "repo": "octo/repo",
  "version": "1.2.3",
}
`);
});
