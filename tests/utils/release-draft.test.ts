import { describe, expect, test } from '@jest/globals';
import { buildReleaseDraft } from '@/utils/release-draft.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';

describe('buildReleaseDraft', () => {
  test('builds complete ReleaseDraft from commit list without PR metadata', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-03',
      commitList: [
        { sha: '1234567890abcdef', subject: 'feat: add new CLI command' },
        {
          sha: 'abcdef1234567890',
          subject: 'fix: resolve race condition in file writing',
        },
      ],
      owner: 'acme',
      repo: 'tool',
    });

    expect(draft.version).toBe('0.8.0');
    expect(draft.date).toBe('2026-10-03');
    expect(draft.changes).toHaveLength(2);
    expect(draft.changes[0].id).toBe('commit:1234567890abcdef');
    expect(draft.changes[0].title).toBe('add new CLI command');
    expect(draft.assignments['commit:1234567890abcdef']).toBe('Added');
    expect(draft.assignments['commit:abcdef1234567890']).toBe('Fixed');
  });

  test('builds ReleaseDraft from pull requests mapping with PR IDs', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-03',
      commitList: [{ sha: '111', subject: 'feat: implement feature (#42)' }],
      pullRequestsBySha: {
        '111': [
          {
            number: 42,
            title: 'feat: implement feature',
            author: 'octocat',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
      },
      owner: 'acme',
      repo: 'tool',
    });

    expect(draft.changes).toHaveLength(1);
    expect(draft.changes[0].id).toBe('pr:42');
    expect(draft.changes[0].author).toBe('octocat');
    expect(draft.assignments['pr:42']).toBe('Added');
    expect(draft.changes[0].url).toBe('https://github.com/acme/tool/pull/42');
  });

  test('does not link an issue reference from the commit subject as a pull request', () => {
    const commitList = [
      {
        sha: 'abc123',
        subject: 'feat(providers): add xAI Grok provider support (#225)',
      },
    ];
    const prMapBySha = buildPrMapBySha({
      commitList,
      prsLog: '',
      repoPath: '.',
    });
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-06',
      commitList,
      titleToPr: buildTitleToPr(commitList, '', prMapBySha),
      owner: 'nyaomaru',
      repo: 'changelog-bot',
    });

    expect(draft.changes[0].pr).toBeUndefined();
    expect(draft.changes[0].url).toBeUndefined();
    expect(draft.changes[0].title).toContain('(#225)');
  });

  test('tracks collapsed-into-pr exclusions when multiple commits map to the same PR', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-14',
      commitList: [
        { sha: 'aaa', subject: 'feat: add first part of feature' },
        { sha: 'bbb', subject: 'fix: add second part of feature' },
      ],
      pullRequestsBySha: {
        aaa: [
          {
            number: 42,
            title: 'feat: add complete feature',
            author: 'octocat',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
        bbb: [
          {
            number: 42,
            title: 'feat: add complete feature',
            author: 'octocat',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
      },
      owner: 'acme',
      repo: 'tool',
    });

    expect(draft.changes).toHaveLength(1);
    expect(draft.changes[0].id).toBe('pr:42');
    expect(draft.excludedChanges).toHaveLength(1);
    expect(draft.excludedChanges[0].change.id).toBe('commit:bbb');
    expect(draft.excludedChanges[0].reason).toBe('collapsed-into-pr');
    expect(draft.excludedChanges[0].detail).toBe(
      'Commit bbb collapsed into PR #42',
    );
  });

  test('deduplicates repeated explicit PR references in release notes into one canonical change', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-14',
      releaseBody: [
        "## What's Changed",
        '- feat: add feature in #42',
        '- fix: additional fix for #42',
      ].join('\n'),
      commitList: [],
      owner: 'acme',
      repo: 'tool',
    });

    expect(draft.changes).toHaveLength(1);
    expect(draft.changes[0].id).toBe('pr:42');
    expect(draft.excludedChanges).toEqual([]);
  });

  test('tracks duplicate exclusions when release note item resolves to an existing PR via title mapping', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-14',
      releaseBody: [
        "## What's Changed",
        '- feat: add feature in #42',
        '- fix: additional fix for feature',
      ].join('\n'),
      titleToPr: {
        'fix: additional fix for feature': 42,
      },
      commitList: [],
      owner: 'acme',
      repo: 'tool',
    });

    expect(draft.changes).toHaveLength(1);
    expect(draft.changes[0].id).toBe('pr:42');
    expect(draft.excludedChanges).toHaveLength(1);
    expect(draft.excludedChanges[0].change.id).toBe('release-note:1');
    expect(draft.excludedChanges[0].reason).toBe('duplicate');
    expect(draft.excludedChanges[0].detail).toBe('Duplicate change for PR #42');
  });
});
