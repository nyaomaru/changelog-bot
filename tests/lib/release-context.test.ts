// @ts-nocheck
import { describe, expect, test, jest } from '@jest/globals';

const tryDetectLatestTag = jest.fn();
const tryDetectPrevTag = jest.fn();
const firstCommit = jest.fn();
const dateForRef = jest.fn();
const readChangelog = jest.fn();
const resolveGitHubAuth = jest.fn();

await jest.unstable_mockModule('@/lib/git.js', () => ({
  tryDetectLatestTag,
  tryDetectPrevTag,
  firstCommit,
  dateForRef,
}));

await jest.unstable_mockModule('@/lib/changelog.js', () => ({
  readChangelog,
}));

await jest.unstable_mockModule('@/utils/github-auth.js', () => ({
  resolveGitHubAuth,
}));

const { resolveReleasePlan, prepareExistingChangelog, resolveRunCredentials } =
  await import('@/lib/release-context.js');

describe('lib/release-context', () => {
  test('resolves release metadata from repo state when flags are omitted', () => {
    tryDetectLatestTag.mockReturnValue('v1.2.0');
    tryDetectPrevTag.mockReturnValue('v1.1.0');
    firstCommit.mockReturnValue('abc1234');
    dateForRef.mockReturnValue('2026-04-10');

    const plan = resolveReleasePlan(
      {
        repoPath: '/repo',
        changelogPath: 'CHANGELOG.md',
        baseBranch: 'main',
        provider: 'openai',
        releaseTag: undefined,
        releaseName: undefined,
        releaseBody: '',
        dryRun: false,
      },
      'octo/repo',
    );

    expect(plan).toEqual({
      owner: 'octo',
      repo: 'repo',
      repoPath: '/repo',
      changelogPath: 'CHANGELOG.md',
      releaseRef: 'v1.2.0',
      version: '1.2.0',
      prevRef: 'v1.1.0',
      date: '2026-04-10',
    });
  });

  test('removes an existing compare link for the current version', () => {
    readChangelog.mockReturnValue(
      [
        '# Changelog',
        '',
        '## [v1.2.0]',
        '- change',
        '',
        '[v1.2.0]: https://example.com/compare/v1.1.0...v1.2.0',
        '[v1.1.0]: https://example.com/compare/v1.0.0...v1.1.0',
      ].join('\n'),
    );

    const existing = prepareExistingChangelog('CHANGELOG.md', '1.2.0');

    expect(existing).not.toContain('[v1.2.0]:');
    expect(existing).toContain('[v1.1.0]:');
  });

  test('resolves GitHub auth and provider-key availability', async () => {
    resolveGitHubAuth.mockResolvedValue({ token: 'gh-token', source: 'pat' });

    const credentials = await resolveRunCredentials('openai', 'octo', 'repo', {
      github: { apiBase: 'https://api.github.com' },
      providers: {
        openai: { apiKey: 'openai-key', model: 'gpt-4o-mini' },
        anthropic: { apiKey: undefined, model: 'claude-3-5-sonnet-20240620' },
      },
    });

    expect(resolveGitHubAuth).toHaveBeenCalledWith('octo', 'repo', {
      apiBase: 'https://api.github.com',
    });
    expect(credentials).toEqual({
      token: 'gh-token',
      hasProviderKey: true,
    });
  });
});
