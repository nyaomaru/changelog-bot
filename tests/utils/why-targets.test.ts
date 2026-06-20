import { describe, expect, test } from '@jest/globals';

import type { WhyNote } from '@/types/why.js';
import {
  applyWhyNotesToSection as applyWhyNotesToSectionForRepository,
  extractWhyTargets as extractWhyTargetsForRepository,
} from '@/utils/why-targets.js';

const repository = { owner: 'octo', repo: 'repo' };
const extractWhyTargets = (markdown: string) =>
  extractWhyTargetsForRepository(markdown, repository);
const applyWhyNotesToSection = (
  markdown: string,
  notes: ReadonlyMap<number, WhyNote>,
  whyLabel: string,
) => applyWhyNotesToSectionForRepository(markdown, notes, whyLabel, repository);

describe('why-targets', () => {
  test('extracts eligible PRs and skips automatic maintenance before fetching', () => {
    const markdown = [
      '## [1.2.3] - 2026-06-14',
      '',
      '### Added',
      '',
      '- Add release note publishing [#42](https://github.com/octo/repo/pull/42) by @alice',
      '- Bump vite from 5.0.0 to 5.1.0 [#43](https://github.com/octo/repo/pull/43) by @dependabot[bot]',
      '',
      '### Chore',
      '',
      '- Update lockfile [#44](https://github.com/octo/repo/pull/44) by @alice',
    ].join('\n');

    const result = extractWhyTargets(markdown);

    expect(result.targets).toEqual([
      {
        prNumber: 42,
        itemText: 'Add release note publishing',
        sectionTitle: 'Added',
        author: 'alice',
      },
    ]);
    expect(result.skippedBeforeFetch).toBe(1);
  });

  test('prefers pull request links over earlier issue references', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Fix #123 lookup before fetching in [#456](https://github.com/octo/repo/pull/456)',
      '',
    ].join('\n');

    const result = extractWhyTargets(markdown);

    expect(result.targets).toEqual([
      expect.objectContaining({
        prNumber: 456,
        itemText: 'Fix #123 lookup before fetching',
        sectionTitle: 'Fixed',
      }),
    ]);
  });

  test('prefers the owning PR suffix over earlier upstream pull URLs', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Fix upstream https://github.com/foo/bar/pull/123 in [#456](https://github.com/octo/repo/pull/456)',
      '',
    ].join('\n');

    const result = extractWhyTargets(markdown);

    expect(result.targets).toEqual([
      expect.objectContaining({
        prNumber: 456,
        itemText: 'Fix upstream https://github.com/foo/bar/pull/123',
        sectionTitle: 'Fixed',
      }),
    ]);
  });

  test('prefers known PR suffixes over earlier plain issue references', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Fix #123 lookup before fetching in #456',
      '',
    ].join('\n');

    const result = extractWhyTargets(markdown);

    expect(result.targets).toEqual([
      expect.objectContaining({
        prNumber: 456,
        itemText: 'Fix #123 lookup before fetching',
        sectionTitle: 'Fixed',
      }),
    ]);
  });

  test('prefers parenthesized fallback PR suffixes over earlier issue references', () => {
    const markdown = ['### Fixed', '', '- Fix #45 lookup (#123)', ''].join(
      '\n',
    );

    const result = extractWhyTargets(markdown);

    expect(result.targets).toEqual([
      expect.objectContaining({
        prNumber: 123,
        itemText: 'Fix #45 lookup',
        sectionTitle: 'Fixed',
      }),
    ]);
  });

  test('skips prose references when no PR-specific target is present', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Fix regression from #123 for a change merged by PR #456',
      '- Preserve behavior described in [#789](https://github.com/octo/repo/issues/789)',
      '',
    ].join('\n');

    const result = extractWhyTargets(markdown);

    expect(result.targets).toEqual([]);
    expect(result.skippedBeforeFetch).toBe(2);
  });

  test.each([
    '- Sync behavior with https://github.com/foo/bar/pull/123',
    '- Sync behavior in [#123](https://github.com/foo/bar/pull/123)',
  ])(
    'rejects an external pull URL without a current-repository suffix: %s',
    (bullet) => {
      const markdown = ['### Fixed', '', bullet, ''].join('\n');

      const result = extractWhyTargets(markdown);

      expect(result.targets).toEqual([]);
      expect(result.skippedBeforeFetch).toBe(1);
    },
  );

  test('applies WHY notes under matching top-level bullets', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Restore draft release handling [#12](https://github.com/octo/repo/pull/12)',
      '',
    ].join('\n');
    const note: WhyNote = {
      prNumber: 12,
      why: 'Draft releases publish later and need the same changelog path.',
      confidence: 'high',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
    };

    const updated = applyWhyNotesToSection(
      markdown,
      new Map([[12, note]]),
      'Why',
    );

    expect(updated).toContain(
      '  - Why: Draft releases publish later and need the same changelog path.',
    );
  });

  test('applies WHY notes to pull request links instead of earlier issue references', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Fix #123 lookup before fetching in [#456](https://github.com/octo/repo/pull/456)',
      '',
    ].join('\n');
    const note: WhyNote = {
      prNumber: 456,
      why: 'The fetch must use the PR that supplied the changelog item.',
      confidence: 'high',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
    };

    const updated = applyWhyNotesToSection(
      markdown,
      new Map([[456, note]]),
      'Why',
    );

    expect(updated).toContain(
      '  - Why: The fetch must use the PR that supplied the changelog item.',
    );
  });

  test('applies WHY notes to the owning suffix instead of an upstream pull URL', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Fix upstream https://github.com/foo/bar/pull/123 in [#456](https://github.com/octo/repo/pull/456)',
      '',
    ].join('\n');
    const note: WhyNote = {
      prNumber: 456,
      why: 'The local PR owns this changelog item.',
      confidence: 'high',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
    };

    const updated = applyWhyNotesToSection(
      markdown,
      new Map([[456, note]]),
      'Why',
    );

    expect(updated).toContain(
      '  - Why: The local PR owns this changelog item.',
    );
  });

  test('applies WHY notes to parenthesized fallback PR suffixes', () => {
    const markdown = ['### Fixed', '', '- Fix #45 lookup (#123)', ''].join(
      '\n',
    );
    const note: WhyNote = {
      prNumber: 123,
      why: 'The fallback suffix identifies the pull request for the change.',
      confidence: 'high',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
    };

    const updated = applyWhyNotesToSection(
      markdown,
      new Map([[123, note]]),
      'Why',
    );

    expect(updated).toContain(
      '  - Why: The fallback suffix identifies the pull request for the change.',
    );
  });

  test('does not apply a WHY note to an external pull URL with the same number', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Sync behavior with https://github.com/foo/bar/pull/123',
      '',
    ].join('\n');
    const note: WhyNote = {
      prNumber: 123,
      why: 'This reason belongs to the current repository pull request.',
      confidence: 'high',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
    };

    const updated = applyWhyNotesToSection(
      markdown,
      new Map([[123, note]]),
      'Why',
    );

    expect(updated).toBe(markdown);
  });

  test('does not apply WHY notes to non-eligible sections with the same PR number', () => {
    const markdown = [
      '### Fixed',
      '',
      '- Restore draft release handling [#12](https://github.com/octo/repo/pull/12)',
      '',
      '### Docs',
      '',
      '- Document draft release handling [#12](https://github.com/octo/repo/pull/12)',
      '',
    ].join('\n');
    const note: WhyNote = {
      prNumber: 12,
      why: 'Draft releases publish later and need the same changelog path.',
      confidence: 'high',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
    };

    const updated = applyWhyNotesToSection(
      markdown,
      new Map([[12, note]]),
      'Why',
    );

    expect(updated.match(new RegExp(' {2}- Why:', 'g'))).toHaveLength(1);
    expect(updated).toContain(
      [
        '### Docs',
        '',
        '- Document draft release handling [#12](https://github.com/octo/repo/pull/12)',
      ].join('\n'),
    );
  });
});
