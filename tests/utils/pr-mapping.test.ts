// @ts-nocheck
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// With ESM + ts-jest, mock modules before importing the SUT using unstable_mockModule.
await jest.unstable_mockModule('@/lib/git.js', () => ({
  extractPrRefsFromText: (text: string) => {
    const matches = text.match(/#(\d+)/g) || [];
    return [...new Set(matches.map((s) => Number(s.slice(1))))];
  },
  commitsFromMerge: jest.fn(() => ['c2', 'c3']),
}));

const { buildPrMapBySha, buildTitleToPr } =
  await import('@/utils/pr-mapping.js');

describe('pr-mapping utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildPrMapBySha merges hints, api map, and expands via merges', () => {
    const commitList = [
      { sha: 'm1', subject: 'merge commit' },
      { sha: 'c1', subject: 'feat: add feature #10' },
      { sha: 'c2', subject: 'fix: bug' },
      { sha: 'c3', subject: 'docs: update' },
    ];
    const prsLog = 'm1 Merge pull request 10 Some title';
    const apiPrMap = {
      // associate the merge commit with PR 10 so expansion can happen
      m1: [{ number: 10 }],
      c2: [{ number: 10 }],
      c3: [{ number: 11 }],
    };

    const out = buildPrMapBySha({
      commitList,
      prsLog,
      repoPath: '.',
      apiPrMap,
    });

    expect(out.c1).toEqual([10]);
    // c2 already has 10; expand from merge keeps 10
    expect(out.c2).toContain(10);
    // c3 had 11 from API, gets 10 from merge expansion too
    expect(new Set(out.c3)).toEqual(new Set([11, 10]));
  });

  test('buildTitleToPr maps normalized titles from commits and merges', () => {
    const commitList = [{ sha: 'a1', subject: 'feat(scope): Add Login' }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prMapBySha = { a1: [42], m2: [100] } as any;
    const prsLog = 'm2 Merge pull request 100 Add Login with tweaks';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = buildTitleToPr(commitList as any, prsLog, prMapBySha);

    expect(map['add login']).toBe(42);
    expect(map['merge pull request 100 add login with tweaks']).toBe(100);
  });
});
