// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import {
  buildReleaseItemsFromPullRequests,
  parseReleaseNotes,
  buildSectionFromRelease,
} from '@/utils/release.js';

describe('release utils', () => {
  test('builds one parent release item for commits in the same pull request', () => {
    const items = buildReleaseItemsFromPullRequests(
      [
        { sha: 'abc', subject: 'feat: add opt-in WHY extraction' },
        { sha: 'def', subject: 'fix: recognize punctuated WHY headings' },
      ],
      {
        abc: [
          {
            number: 138,
            title: 'feat: add opt-in WHY extraction',
            author: 'nyaomaru',
            url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
          },
        ],
        def: [
          {
            number: 138,
            title: 'feat: add opt-in WHY extraction',
            author: 'nyaomaru',
            url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
          },
        ],
      },
    );

    expect(items).toEqual([
      {
        title: 'add opt-in WHY extraction',
        rawTitle: 'feat: add opt-in WHY extraction',
        author: 'nyaomaru',
        pr: 138,
        url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
      },
    ]);
  });

  test('keeps unmapped local commits alongside pull request items', () => {
    const items = buildReleaseItemsFromPullRequests(
      [
        { sha: 'abc', subject: 'feat: add opt-in WHY extraction' },
        { sha: 'def', subject: 'fix: recognize punctuated WHY headings' },
      ],
      {
        abc: [{ number: 138, title: 'feat: add opt-in WHY extraction' }],
      },
    );

    expect(items).toEqual([
      {
        title: 'add opt-in WHY extraction',
        rawTitle: 'feat: add opt-in WHY extraction',
        pr: 138,
      },
      {
        title: 'recognize punctuated WHY headings',
        rawTitle: 'fix: recognize punctuated WHY headings',
      },
    ]);
  });

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

  test('parseReleaseNotes preserves custom sections and handles typographic headings', () => {
    const whatsNewHeading = 'What\u2019s New \u{1F680}';
    const body = [
      '# v1.2.0',
      '',
      `## ${whatsNewHeading}`,
      'Includes user-facing highlights and examples.',
      '',
      '## What\u2019s Changed',
      '- feat: Add assert helper by @alice in #321',
      '',
      `## ${whatsNewHeading}`,
      'Includes user-facing highlights and examples.',
      '',
      '## Migration Notes',
      'No migration steps required.',
      '',
      '**Full Changelog**: v1.1.13...v1.2.0',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].title).toBe('Add assert helper');
    expect(parsed.sections).toEqual([
      {
        heading: whatsNewHeading,
        body: 'Includes user-facing highlights and examples.',
      },
      {
        heading: 'Migration Notes',
        body: 'No migration steps required.',
      },
    ]);
    expect(parsed.fullChangelog).toBe(
      'https://github.com/acme/repo/compare/v1.1.13...v1.2.0',
    );
  });

  test('parseReleaseNotes triages stray prefix before the first custom heading', () => {
    const body = [
      '# v1.2.0',
      '',
      '\u2022 ## What\u2019s New \u{1F680}',
      '- GitHub Action inputs respect config precedence.',
      '',
      '### Sample implementation',
      '',
      '```yaml',
      '- uses: nyaomaru/changelog-bot@v0',
      '```',
      '',
      '## What\u2019s Changed',
      '- feat: add config file support by @alice in #321',
      '',
      '**Full Changelog**: v1.1.13...v1.2.0',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.sections).toEqual([
      {
        heading: 'What\u2019s New \u{1F680}',
        body: [
          '- GitHub Action inputs respect config precedence.',
          '',
          '### Sample implementation',
          '',
          '```yaml',
          '- uses: nyaomaru/changelog-bot@v0',
          '```',
        ].join('\n'),
      },
    ]);
  });

  test('parseReleaseNotes does not promote prose before an embedded heading marker', () => {
    const body = [
      'Release summary ## Not a Heading',
      '',
      '## What\u2019s Changed',
      '- feat: add config file support by @alice in #321',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.sections).toBeUndefined();
  });

  test('parseReleaseNotes keeps H3 headings inside custom section bodies', () => {
    const body = [
      '## What\u2019s New',
      'Highlights for this release.',
      '',
      '\u2022 ### Sample implementation',
      'Use the action from workflow YAML.',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });

    expect(parsed.sections).toEqual([
      {
        heading: 'What\u2019s New',
        body: [
          'Highlights for this release.',
          '',
          '### Sample implementation',
          'Use the action from workflow YAML.',
        ].join('\n'),
      },
    ]);
  });

  test('parseReleaseNotes normalizes noisy non-H2 headings without making them section boundaries', () => {
    const body = [
      '## What\u2019s New',
      '\u2022 # Context',
      'Release-level context stays in the custom section body.',
      '',
      '> ## Quoted heading stays literal',
      '- ### List heading stays literal',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });

    expect(parsed.sections).toEqual([
      {
        heading: 'What\u2019s New',
        body: [
          '# Context',
          'Release-level context stays in the custom section body.',
          '',
          '> ## Quoted heading stays literal',
          '- ### List heading stays literal',
        ].join('\n'),
      },
    ]);
  });

  test('parseReleaseNotes triages stray prefix before generated notes headings', () => {
    const body = [
      '# v1.2.0',
      '',
      '\u2022 ## What\u2019s Changed',
      '- feat: add config file support by @alice in #321',
      '',
      '\u2022 ## Migration Notes',
      'No migration steps required.',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].title).toBe('add config file support');
    expect(parsed.sections).toEqual([
      {
        heading: 'Migration Notes',
        body: 'No migration steps required.',
      },
    ]);
  });

  test('parseReleaseNotes strips trailing attribution noise after PR and author extraction', () => {
    const body = [
      '# v0.2.0',
      '',
      "## What's Changed",
      '- chore: Update docs by @bob by in #77',
    ].join('\n');

    const parsed = parseReleaseNotes(body, { owner: 'acme', repo: 'repo' });

    expect(parsed.items).toEqual([
      {
        title: 'Update docs',
        rawTitle: 'chore: Update docs',
        author: 'bob',
        pr: 77,
        url: 'https://github.com/acme/repo/pull/77',
      },
    ]);
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

  test('buildSectionFromRelease demotes headings inside custom release-note sections', () => {
    const section = buildSectionFromRelease({
      version: '1.8.0',
      date: '2026-06-06',
      items: [],
      categories: {},
      sections: [
        {
          heading: 'What\u2019s new \u{1F680}',
          body: [
            '### Add `typedStruct`',
            '',
            '`typedStruct<T>()` keeps guards aligned with existing types.',
            '',
            '```ts',
            '### Not a markdown heading',
            'typedStruct<User>()({',
            '  id: isNumber',
            '});',
            '```',
          ].join('\n'),
        },
      ],
    });

    expect(section).toContain('### What\u2019s new \u{1F680}');
    expect(section).toContain('#### Add `typedStruct`');
    expect(section).not.toContain('\n### Add `typedStruct`');
    expect(section).toContain('```ts\n### Not a markdown heading\n');
  });

  test('buildSectionFromRelease matches raw conventional titles and avoids duplicate category membership', () => {
    const section = buildSectionFromRelease({
      version: '1.2.3',
      date: '2026-05-16',
      items: [
        {
          title: 'Add export flag',
          rawTitle: 'feat: Add export flag',
          pr: 100,
          url: 'https://github.com/acme/repo/pull/100',
        },
      ],
      categories: {
        Added: ['feat: Add export flag'],
        Changed: ['Add export flag'],
      },
    });

    expect(section).toBe(
      [
        '## [v1.2.3] - 2026-05-16',
        '',
        '### Added',
        '',
        '- Add export flag in [#100](https://github.com/acme/repo/pull/100)',
        '',
      ].join('\n'),
    );
  });
});
