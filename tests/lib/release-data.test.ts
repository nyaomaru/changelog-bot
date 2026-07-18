import { describe, expect, jest, test } from '@jest/globals';
import {
  resolvePullRequestsBySha,
  resolveReleaseBody,
} from '@/lib/release-data.js';
import type { ChangelogRunDependencies } from '@/lib/changelog-run.js';
import type { CliOptions } from '@/schema/cli.js';

const cli: CliOptions = {
  repoPath: '.',
  changelogPath: 'CHANGELOG.md',
  baseBranch: 'main',
  provider: 'openai',
  releaseTag: 'v1.2.3',
  releaseName: '1.2.3',
  releaseBody: '',
  language: 'en',
  dryRun: true,
  dryRunJsonReport: false,
  failOnLlmError: false,
  requireProvider: false,
  noAi: false,
  why: false,
  whyMaxPrs: 30,
  whyMaxCharsPerPr: 800,
  whyConfidence: 'medium',
  whyLabel: 'Why',
};

function createPullRequestDependencies() {
  return {
    currentBranch: jest.fn<ChangelogRunDependencies['currentBranch']>(
      () => 'feature/release',
    ),
    fetchPullRequestsForBranch: jest.fn<
      ChangelogRunDependencies['fetchPullRequestsForBranch']
    >(async () => []),
    tryFindPullRequestNumberForBranch: jest.fn<
      ChangelogRunDependencies['tryFindPullRequestNumberForBranch']
    >(() => null),
    mapCommitsToPrs: jest.fn<ChangelogRunDependencies['mapCommitsToPrs']>(
      async () => ({}),
    ),
  };
}

describe('resolvePullRequestsBySha', () => {
  test('uses a remote branch PR when the GitHub branch lookup is empty', async () => {
    const deps = createPullRequestDependencies();
    deps.tryFindPullRequestNumberForBranch.mockReturnValue(42);

    await expect(
      resolvePullRequestsBySha({
        deps,
        owner: 'octo',
        repo: 'repo',
        releaseRef: 'HEAD',
        repoPath: '.',
        token: 'token',
        githubApiBase: 'https://api.github.test',
        commitList: [
          { sha: 'newest', subject: 'fix: newest change' },
          { sha: 'oldest', subject: 'feat: release branch' },
        ],
      }),
    ).resolves.toEqual({
      newest: [
        {
          number: 42,
          title: 'feat: release branch',
          url: 'https://github.com/octo/repo/pull/42',
        },
      ],
      oldest: [
        {
          number: 42,
          title: 'feat: release branch',
          url: 'https://github.com/octo/repo/pull/42',
        },
      ],
    });
    expect(deps.mapCommitsToPrs).not.toHaveBeenCalled();
  });

  test('delegates tagged releases to per-commit GitHub mapping', async () => {
    const deps = createPullRequestDependencies();
    deps.mapCommitsToPrs.mockResolvedValue({
      abc123: [{ number: 7 }],
    });

    await expect(
      resolvePullRequestsBySha({
        deps,
        owner: 'octo',
        repo: 'repo',
        releaseRef: 'v1.2.3',
        repoPath: '.',
        githubApiBase: 'https://api.github.test',
        commitList: [{ sha: 'abc123', subject: 'feat: tagged change' }],
      }),
    ).resolves.toEqual({ abc123: [{ number: 7 }] });
    expect(deps.currentBranch).not.toHaveBeenCalled();
    expect(deps.mapCommitsToPrs).toHaveBeenCalledWith(
      'octo',
      'repo',
      ['abc123'],
      undefined,
      'https://api.github.test',
    );
  });
});

describe('resolveReleaseBody', () => {
  test('prefers CLI release notes without making a GitHub request', async () => {
    const fetchReleaseBody = jest.fn<
      ChangelogRunDependencies['fetchReleaseBody']
    >(async () => 'GitHub release notes');

    await expect(
      resolveReleaseBody({
        cli: { ...cli, releaseBody: 'CLI release notes' },
        deps: { fetchReleaseBody },
        owner: 'octo',
        repo: 'repo',
        githubApiBase: 'https://api.github.test',
      }),
    ).resolves.toBe('CLI release notes');
    expect(fetchReleaseBody).not.toHaveBeenCalled();
  });

  test('fetches release notes when a tag is available', async () => {
    const fetchReleaseBody = jest.fn<
      ChangelogRunDependencies['fetchReleaseBody']
    >(async () => 'GitHub release notes');

    await expect(
      resolveReleaseBody({
        cli,
        deps: { fetchReleaseBody },
        owner: 'octo',
        repo: 'repo',
        token: 'token',
        githubApiBase: 'https://api.github.test',
      }),
    ).resolves.toBe('GitHub release notes');
    expect(fetchReleaseBody).toHaveBeenCalledWith(
      'octo',
      'repo',
      'v1.2.3',
      'token',
      'https://api.github.test',
    );
  });
});
