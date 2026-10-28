import { describe, expect, jest, test } from '@jest/globals';
import {
  resolvePullRequestsBySha,
  resolvePullRequestsByShaWithDiagnostics,
  resolveReleaseBody,
  resolveReleaseBodyWithDiagnostics,
} from '@/lib/release-data.js';
import { createMetadataDiagnostics } from '@/utils/metadata-diagnostics.js';
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
  whyEngine: 'llm',
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

describe('resolvePullRequestsByShaWithDiagnostics', () => {
  test('accumulates diagnostics when commit mapping provides diagnostics', async () => {
    const deps = {
      ...createPullRequestDependencies(),
      mapCommitsToPrsWithDiagnostics: jest.fn(async () => {
        const diagnostics = createMetadataDiagnostics();
        diagnostics.totalLookups = 2;
        diagnostics.successfulLookups = 1;
        diagnostics.degradedLookups = 1;
        diagnostics.failureCounts['rate-limited'] = 1;
        diagnostics.fallbackReasons = ['API rate limit exceeded'];
        return {
          pullRequestsBySha: { sha1: [{ number: 10 }] },
          diagnostics,
        };
      }),
    };

    const result = await resolvePullRequestsByShaWithDiagnostics({
      deps,
      owner: 'octo',
      repo: 'repo',
      releaseRef: 'v1.0.0',
      repoPath: '.',
      githubApiBase: 'https://api.github.test',
      commitList: [
        { sha: 'sha1', subject: 'feat: change 1' },
        { sha: 'sha2', subject: 'fix: change 2' },
      ],
    });

    expect(result.pullRequestsBySha).toEqual({ sha1: [{ number: 10 }] });
    expect(result.diagnostics.totalLookups).toBe(2);
    expect(result.diagnostics.degradedLookups).toBe(1);
    expect(result.diagnostics.failureCounts['rate-limited']).toBe(1);
    expect(result.diagnostics.fallbackReasons).toEqual([
      'API rate limit exceeded',
    ]);
  });
});

describe('resolveReleaseBodyWithDiagnostics', () => {
  test('records degraded diagnostics when release lookup fails', async () => {
    const deps = {
      fetchReleaseBody: jest.fn(async () => ''),
      fetchReleaseBodyResult: jest.fn(async () => ({
        status: 'not-found' as const,
        message: 'Release tag v1.0.0 not found',
      })),
    };

    const result = await resolveReleaseBodyWithDiagnostics({
      cli,
      deps,
      owner: 'octo',
      repo: 'repo',
      token: 'test-token',
      githubApiBase: 'https://api.github.test',
    });

    expect(result.releaseBody).toBe('');
    expect(result.diagnostics.totalLookups).toBe(1);
    expect(result.diagnostics.degradedLookups).toBe(1);
    expect(result.diagnostics.failureCounts['not-found']).toBe(1);
    expect(result.diagnostics.fallbackReasons).toEqual([
      'Release v1.2.3: release notes not found (404)',
    ]);
  });
});
