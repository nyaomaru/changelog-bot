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
    language: 'en',
  });

  expect(input.repo).toBe('owner/repo');
  expect(input.version).toBe('1.2.3');
  expect(input.date).toBe('2024-01-02');
  expect(input.releaseTag).toBe('v1.2.3');
  expect(input.prevTag).toBe('v1.2.2');
  expect(input.releaseBody).toBe('release body');
  expect(input.gitLog).toBe('abc Fix: something');
  expect(input.mergedPRs).toBe('- #123 Some PR');
  expect(input.language).toBe('en');
  expect(input.changelogPreview.length).toBe(CHANGELOG_PREVIEW_LIMIT);
});
