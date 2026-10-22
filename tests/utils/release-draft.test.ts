import { describe, expect, test } from '@jest/globals';
import { buildReleaseDraft } from '@/utils/release-draft.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';
import { validateReleaseResult } from '@/utils/release-validation.js';

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
    expect(draft.excludedChanges).toHaveLength(2);
    expect(draft.excludedChanges[0].change.id).toBe('commit:aaa');
    expect(draft.excludedChanges[0].reason).toBe('collapsed-into-pr');
    expect(draft.excludedChanges[0].detail).toBe(
      'Commit aaa collapsed into PR #42',
    );
    expect(draft.excludedChanges[1].change.id).toBe('commit:bbb');
    expect(draft.excludedChanges[1].reason).toBe('collapsed-into-pr');
    expect(draft.excludedChanges[1].detail).toBe(
      'Commit bbb collapsed into PR #42',
    );
    expect(draft.sourceChanges).toHaveLength(2);
    expect(draft.sourceChanges[0].id).toBe('commit:aaa');
    expect(draft.sourceChanges[1].id).toBe('commit:bbb');
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
    expect(draft.excludedChanges).toHaveLength(1);
    expect(draft.excludedChanges[0].change.id).toBe('release-note:1');
    expect(draft.excludedChanges[0].reason).toBe('duplicate');
    expect(draft.excludedChanges[0].detail).toBe('Duplicate change for PR #42');
    expect(draft.sourceChanges).toHaveLength(2);
    expect(draft.sourceChanges?.[0].id).toBe('pr:42');
    expect(draft.sourceChanges?.[1].id).toBe('release-note:1');
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

  test('preserves independent pre-transform sourceChanges ledger across commits', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-14',
      commitList: [
        { sha: 'aaa', subject: 'feat: add first change' },
        { sha: 'bbb', subject: 'fix: add second change' },
      ],
      owner: 'acme',
      repo: 'tool',
    });

    expect(draft.sourceChanges).toHaveLength(2);
    expect(draft.sourceChanges.map((change) => change.id)).toEqual([
      'commit:aaa',
      'commit:bbb',
    ]);
  });

  test('commit-source ledger is independent of PR mapping and tracks all collapsed commits', () => {
    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-14',
      commitList: [
        { sha: 'aaa', subject: 'feat: add first change' },
        { sha: 'bbb', subject: 'fix: add second change' },
        { sha: 'ccc', subject: 'chore: standalone unmapped commit' },
      ],
      pullRequestsBySha: {
        aaa: [
          {
            number: 42,
            title: 'feat: complete PR feature',
            author: 'octocat',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
        bbb: [
          {
            number: 42,
            title: 'feat: complete PR feature',
            author: 'octocat',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
      },
      owner: 'acme',
      repo: 'tool',
    });

    // Ledger is captured from commitList before any PR mapping runs
    expect(draft.sourceChanges).toEqual([
      expect.objectContaining({ id: 'commit:aaa' }),
      expect.objectContaining({ id: 'commit:bbb' }),
      expect.objectContaining({ id: 'commit:ccc' }),
    ]);

    // Changes contains the promoted PR and the unmapped commit
    expect(draft.changes).toHaveLength(2);
    expect(draft.changes[0].id).toBe('pr:42');
    expect(draft.changes[1].id).toBe('commit:ccc');

    // Both source commits that were collapsed into PR #42 are tracked with typed reason
    expect(draft.excludedChanges).toHaveLength(2);
    expect(draft.excludedChanges[0].change.id).toBe('commit:aaa');
    expect(draft.excludedChanges[0].reason).toBe('collapsed-into-pr');
    expect(draft.excludedChanges[1].change.id).toBe('commit:bbb');
    expect(draft.excludedChanges[1].reason).toBe('collapsed-into-pr');
  });
  test('discovers sub-changes when releaseBody contains Whats Changed and PR has distinct commits', () => {
    const releaseBody = [
      "## What's Changed",
      '* Multi-feature update by @alice in #42',
      '* Standalone fix by @bob in #43',
      '',
      '**Full Changelog**: https://github.com/acme/tool/compare/v0.7.0...v0.8.0',
    ].join('\n');

    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-20',
      releaseBody,
      commitList: [
        { sha: 'aaa', subject: 'feat: add OAuth provider' },
        { sha: 'bbb', subject: 'fix: resolve race condition in token refresh' },
        { sha: 'ccc', subject: 'fix: button padding' },
      ],
      pullRequestsBySha: {
        aaa: [{ number: 42, title: 'Multi-feature update', author: 'alice' }],
        bbb: [{ number: 42, title: 'Multi-feature update', author: 'alice' }],
        ccc: [{ number: 43, title: 'Standalone fix', author: 'bob' }],
      },
      owner: 'acme',
      repo: 'tool',
    });

    // PR #42 is expanded into two sub-changes, while PR #43 remains a single PR change
    expect(draft.changes).toHaveLength(3);
    expect(draft.changes[0]).toMatchObject({
      id: 'pr:42:c1',
      title: 'add OAuth provider',
      pr: 42,
    });
    expect(draft.changes[1]).toMatchObject({
      id: 'pr:42:c2',
      title: 'resolve race condition in token refresh',
      pr: 42,
    });
    expect(draft.changes[2]).toMatchObject({
      id: 'pr:43',
      title: 'Standalone fix',
      pr: 43,
    });

    // Parent item pr:42 was recorded in excludedChanges
    const parentPrExcluded = draft.excludedChanges.find(
      (exc) => exc.change.id === 'pr:42',
    );
    expect(parentPrExcluded).toBeDefined();
    expect(parentPrExcluded?.reason).toBe('collapsed-into-pr');

    // Validates cleanly with validateReleaseResult
    const validation = validateReleaseResult(draft);
    expect(validation.kind).toBe('release');
  });

  test('deduplicates separate release-note items resolved via titleToPr before expanding into sub-changes', () => {
    const releaseBody = [
      "## What's Changed",
      '* Multi-feature update by @alice in #42',
      '* Extra note referring to same change by @alice',
      '',
      '**Full Changelog**: https://github.com/acme/tool/compare/v0.7.0...v0.8.0',
    ].join('\n');

    const draft = buildReleaseDraft({
      version: '0.8.0',
      date: '2026-10-22',
      releaseBody,
      commitList: [
        { sha: 'aaa', subject: 'feat: add OAuth provider' },
        { sha: 'bbb', subject: 'fix: resolve race condition in token refresh' },
      ],
      pullRequestsBySha: {
        aaa: [{ number: 42, title: 'Multi-feature update', author: 'alice' }],
        bbb: [{ number: 42, title: 'Multi-feature update', author: 'alice' }],
      },
      titleToPr: {
        'extra note referring to same change': 42,
      },
      owner: 'acme',
      repo: 'tool',
    });

    // The second release-note item resolved to PR #42 via titleToPr and was deduped,
    // so PR #42 expands cleanly into exactly two sub-changes without leaving a lingering third item
    expect(draft.changes).toHaveLength(2);
    expect(draft.changes[0]).toMatchObject({
      id: 'pr:42:c1',
      title: 'add OAuth provider',
      pr: 42,
    });
    expect(draft.changes[1]).toMatchObject({
      id: 'pr:42:c2',
      title: 'resolve race condition in token refresh',
      pr: 42,
    });

    // The duplicate item was recorded in excludedChanges with reason 'duplicate'
    const duplicateExcluded = draft.excludedChanges.find(
      (exc) => exc.reason === 'duplicate',
    );
    expect(duplicateExcluded).toBeDefined();
    expect(duplicateExcluded?.change.pr).toBe(42);

    // Parent item pr:42 was recorded in excludedChanges with reason 'collapsed-into-pr'
    const parentPrExcluded = draft.excludedChanges.find(
      (exc) => exc.change.id === 'pr:42',
    );
    expect(parentPrExcluded).toBeDefined();
    expect(parentPrExcluded?.reason).toBe('collapsed-into-pr');

    // Validates cleanly with validateReleaseResult
    const validation = validateReleaseResult(draft);
    expect(validation.kind).toBe('release');
  });
});
