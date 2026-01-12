// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { parseReleaseNotes, buildSectionFromRelease } from '@/utils/release.js';

describe('release utils', () => {
  test('parseReleaseNotes extracts items and full changelog', () => {
    const body = [
      '# Some Release',
      '',
      "## What's Changed",
      '- feat: Add thing by @alice in #123',
      '- fix(scope): Correct behavior in https://github.com/acme/repo/pull/456',
      '',
      '## Release Notes',
      'Remember to update configuration files manually.',
      '',
      'Full Changelog: v0.1.0...v0.1.1',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });
    const [first, second] = parsed.items;

    expect(parsed.items.length).toBe(2);
    expect(first.title).toBe('Add thing');
    expect(first.author).toBe('alice');
    expect(first.pr).toBe(123);
    expect(first.url).toBe('https://github.com/acme/repo/pull/123');
    expect(second.pr).toBe(456);
    expect(parsed.fullChangelog).toBe(
      'https://github.com/acme/repo/compare/v0.1.0...v0.1.1',
    );
    expect(parsed.sections?.length).toBe(1);
    expect(parsed.sections?.[0]).toEqual({
      heading: 'Release Notes',
      body: 'Remember to update configuration files manually.',
    });
  });

  test('buildSectionFromRelease formats bullets with author and PR link', () => {
    const items = [
      {
        title: 'Add thing',
        author: 'alice',
        pr: 123,
        url: 'https://github.com/acme/repo/pull/123',
      },
    ];

    const section = buildSectionFromRelease({
      version: '0.1.1',
      date: '2024-01-01',
      items,
      categories: { Added: ['Add thing'] },
      fullChangelog: 'https://github.com/acme/repo/compare/v0.1.0...v0.1.1',
      sections: [
        {
          heading: 'Release Notes',
          body: 'Remember to update configuration files manually.',
        },
      ],
    });

    expect(section).toContain('## [v0.1.1] - 2024-01-01');
    expect(section).toContain('### Added');
    expect(section).toContain(
      '- Add thing by @alice in [#123](https://github.com/acme/repo/pull/123)',
    );
    expect(section).toContain(
      '**Full Changelog**: https://github.com/acme/repo/compare/v0.1.0...v0.1.1',
    );
    expect(section).toContain('### Release Notes');
    expect(section).toContain(
      'Remember to update configuration files manually.',
    );
  });
});
