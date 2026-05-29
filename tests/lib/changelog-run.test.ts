// @ts-nocheck
import { describe, expect, jest, test } from '@jest/globals';
import { executeChangelogRun } from '@/lib/changelog-run.js';
import { PROVIDER_OPENAI } from '@/constants/provider.js';

const cli = {
  repoPath: '.',
  changelogPath: 'CHANGELOG.md',
  baseBranch: 'main',
  provider: PROVIDER_OPENAI,
  releaseTag: 'v1.2.3',
  releaseName: '1.2.3',
  releaseBody: 'release notes from cli',
  dryRun: true,
};

const appConfig = {
  github: {
    token: undefined,
    apiBase: 'https://api.github.com',
    repoFullName: 'octo/repo',
  },
  providers: {
    openai: { apiKey: undefined, model: 'mock-openai' },
    anthropic: { apiKey: undefined, model: 'mock-anthropic' },
  },
};

const provider = {
  name: PROVIDER_OPENAI,
  modelName: 'mock-openai',
  supports: {
    jsonMode: true,
    streaming: false,
    reasoning: false,
    maxOutputTokens: 1000,
  },
  generate: jest.fn(),
  classifyTitles: jest.fn(),
};

describe('executeChangelogRun', () => {
  test('dry-run orchestrates changelog generation without writing or creating a PR', async () => {
    const log = jest.fn();
    const deps = {
      providerFactory: jest.fn(() => provider),
      getRepoFullName: jest.fn(() => 'octo/repo'),
      resolveReleasePlan: jest.fn(() => ({
        owner: 'octo',
        repo: 'repo',
        repoPath: '.',
        changelogPath: 'CHANGELOG.md',
        releaseRef: 'v1.2.3',
        version: '1.2.3',
        prevRef: 'v1.2.2',
        date: '2026-05-23',
      })),
      gitMergedPRs: jest.fn(() => 'merged prs'),
      commitsInRange: jest.fn(() => [
        { sha: 'abcdef1234567890', subject: 'feat: add CLI dry run' },
      ]),
      prepareExistingChangelog: jest.fn(() => 'existing changelog'),
      resolveRunCredentials: jest.fn(async () => ({
        token: undefined,
        hasProviderKey: false,
      })),
      mapCommitsToPrs: jest.fn(),
      fetchReleaseBody: jest.fn(),
      buildPrMapBySha: jest.fn(() => ({ abcdef1234567890: [123] })),
      buildTitleToPr: jest.fn(() => ({ 'add CLI dry run': 123 })),
      getProviderRuntimeConfig: jest.fn(() => appConfig.providers.openai),
      buildChangelogLlmOutput: jest.fn(async () => ({
        llm: {
          new_section_markdown: 'generated section',
          insert_after_anchor: '## [Unreleased]',
          pr_title: 'docs(changelog): 1.2.3',
          pr_body: 'body',
          labels: ['changelog'],
        },
        aiUsed: false,
        fallbackReasons: [],
      })),
      finalizeChangelogUpdate: jest.fn(() => ({
        llm: {
          new_section_markdown: 'generated section',
          insert_after_anchor: '## [Unreleased]',
          pr_title: 'docs(changelog): 1.2.3',
          pr_body: 'body',
          labels: ['changelog'],
        },
        updated: 'updated changelog',
      })),
      writeChangelog: jest.fn(),
      ensureGithubTokenRequired: jest.fn(),
      createPR: jest.fn(),
    };

    await executeChangelogRun({ cli, appConfig, log, deps });

    expect(deps.fetchReleaseBody).not.toHaveBeenCalled();
    expect(deps.mapCommitsToPrs).not.toHaveBeenCalled();
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(deps.buildChangelogLlmOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseBody: 'release notes from cli',
        prs: 'merged prs',
        existingChangelog: 'existing changelog',
        provider,
      }),
    );
    expect(log).toHaveBeenNthCalledWith(1, '==== DRY RUN (no PR) ====');
    expect(log).toHaveBeenNthCalledWith(
      2,
      [
        'Provider: openai',
        'Model: mock-openai',
        'AI used: false',
        'Fallback reasons: none',
      ].join('\n'),
    );
    expect(log).toHaveBeenNthCalledWith(3, '');
    expect(log).toHaveBeenNthCalledWith(4, 'updated changelog');
  });
});
