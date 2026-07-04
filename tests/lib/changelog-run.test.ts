import { describe, expect, jest, test } from '@jest/globals';
import {
  executeChangelogRun,
  type ChangelogRunDependencies,
} from '@/lib/changelog-run.js';
import { PROVIDER_OPENAI } from '@/constants/provider.js';
import type { CliOptions } from '@/schema/cli.js';
import type { AppConfig } from '@/types/config.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import type { CustomInstructionsResolution } from '@/lib/customization.js';

const cli: CliOptions = {
  repoPath: '.',
  changelogPath: 'CHANGELOG.md',
  baseBranch: 'main',
  provider: PROVIDER_OPENAI,
  releaseTag: 'v1.2.3',
  releaseName: '1.2.3',
  releaseBody: 'release notes from cli',
  language: 'ja',
  instructions: 'Use concise bullets.',
  instructionsFile: '.github/changelog-instructions.md',
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

const appConfig: AppConfig = {
  github: {
    token: undefined,
    apiBase: 'https://api.github.com',
    repoFullName: 'octo/repo',
  },
  providers: {
    openai: { apiKey: undefined, model: 'mock-openai' },
    anthropic: { apiKey: undefined, model: 'mock-anthropic' },
    gemini: { apiKey: undefined, model: 'mock-gemini' },
  },
};

const provider: Provider = {
  name: PROVIDER_OPENAI,
  modelName: 'mock-openai',
  supports: {
    jsonMode: true,
    streaming: false,
    reasoning: false,
    maxOutputTokens: 1000,
  },
  generate: async () => ({
    new_section_markdown: 'generated section',
    pr_title: 'docs(changelog): test',
    pr_body: 'body',
  }),
  classifyTitles: async () => ({}),
  extractWhyNotes: async () => ({ items: [] }),
};

const unresolvedCustomization: CustomInstructionsResolution = {
  instructions: undefined,
  diagnostics: {
    requested: false,
    resolved: false,
    sources: [],
    chars: 0,
    maxChars: 16000,
    encoding: 'utf8',
    truncated: false,
    fileStatus: 'not_provided',
  },
};

const resolvedCustomization: CustomInstructionsResolution = {
  instructions: 'combined instructions',
  diagnostics: {
    requested: true,
    resolved: true,
    sources: ['inline', 'file'],
    chars: 21,
    maxChars: 16000,
    encoding: 'utf8',
    truncated: false,
    fileStatus: 'loaded',
    filePath: '.github/changelog-instructions.md',
  },
};

function createLlmOutput(overrides: Partial<LLMOutput> = {}): LLMOutput {
  return {
    new_section_markdown: 'generated section',
    insert_after_anchor: '## [Unreleased]',
    pr_title: 'docs(changelog): 1.2.3',
    pr_body: 'body',
    labels: ['changelog'],
    ...overrides,
  };
}

describe('executeChangelogRun', () => {
  test('uses current branch PR metadata for HEAD releases', async () => {
    const log = jest.fn<(message: string) => void>();
    const branchPullRequest = {
      number: 138,
      title: 'feat: add opt-in WHY extraction',
      author: 'nyaomaru',
      url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
    };
    const buildChangelogLlmOutput = jest.fn<
      ChangelogRunDependencies['buildChangelogLlmOutput']
    >(async () => ({
      llm: {
        new_section_markdown: 'generated section',
        pr_title: 'docs(changelog): test',
        pr_body: 'body',
      },
      aiUsed: false,
      fallbackReasons: [],
    }));
    const deps: Partial<ChangelogRunDependencies> = {
      providerFactory: jest.fn(() => provider),
      getRepoFullName: jest.fn(() => 'octo/repo'),
      resolveReleasePlan: jest.fn(() => ({
        owner: 'octo',
        repo: 'repo',
        repoPath: '.',
        changelogPath: 'CHANGELOG.md',
        releaseRef: 'HEAD',
        version: '1.2.3',
        prevRef: 'v1.2.2',
        date: '2026-06-20',
      })),
      gitMergedPRs: jest.fn(() => ''),
      commitsInRange: jest.fn(() => [
        { sha: 'abcdef1234567890', subject: 'feat: add WHY extraction' },
      ]),
      currentBranch: jest.fn(() => 'feature/why-extraction'),
      prepareExistingChangelog: jest.fn(() => 'existing changelog'),
      resolveRunCredentials: jest.fn(async () => ({
        token: undefined,
        hasProviderKey: false,
      })),
      fetchPullRequestsForBranch: jest.fn(async () => [branchPullRequest]),
      mapCommitsToPrs: jest.fn(async () => ({})),
      fetchReleaseBody: jest.fn(async () => ''),
      resolveCustomInstructionsWithDiagnostics: jest.fn<
        ChangelogRunDependencies['resolveCustomInstructionsWithDiagnostics']
      >(() => unresolvedCustomization),
      buildPrMapBySha: jest.fn(() => ({ abcdef1234567890: [138] })),
      buildTitleToPr: jest.fn(() => ({ 'add WHY extraction': 138 })),
      getProviderRuntimeConfig: jest.fn(() => appConfig.providers.openai),
      buildChangelogLlmOutput,
      finalizeChangelogUpdate: jest.fn<
        ChangelogRunDependencies['finalizeChangelogUpdate']
      >((params) => ({
        llm: params.llm,
        updated: 'updated changelog',
      })),
      runWhyExtraction: jest.fn<ChangelogRunDependencies['runWhyExtraction']>(
        async (params) => ({
          llm: params.llm,
          diagnostics: {
            enabled: true,
            aiUsed: false,
            targetsFound: 0,
            prBodiesFetched: 0,
            skippedBeforeFetch: 0,
            skippedLowTrust: 0,
            notesRendered: 0,
            fallbackReasons: [],
          },
        }),
      ),
    };

    await executeChangelogRun({
      cli: { ...cli, releaseTag: 'HEAD', language: 'en' },
      appConfig,
      log,
      deps,
    });

    expect(deps.mapCommitsToPrs).not.toHaveBeenCalled();
    expect(buildChangelogLlmOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestsBySha: {
          abcdef1234567890: [branchPullRequest],
        },
      }),
    );
  });

  test('dry-run orchestrates changelog generation without writing or creating a PR', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps: Partial<ChangelogRunDependencies> = {
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
      mapCommitsToPrs: jest.fn(async () => ({})),
      fetchReleaseBody: jest.fn<ChangelogRunDependencies['fetchReleaseBody']>(
        async () => '',
      ),
      resolveCustomInstructionsWithDiagnostics: jest.fn<
        ChangelogRunDependencies['resolveCustomInstructionsWithDiagnostics']
      >(() => resolvedCustomization),
      buildPrMapBySha: jest.fn(() => ({ abcdef1234567890: [123] })),
      buildTitleToPr: jest.fn(() => ({ 'add CLI dry run': 123 })),
      getProviderRuntimeConfig: jest.fn(() => appConfig.providers.openai),
      buildChangelogLlmOutput: jest.fn<
        ChangelogRunDependencies['buildChangelogLlmOutput']
      >(async () => ({
        llm: createLlmOutput(),
        aiUsed: false,
        fallbackReasons: [],
      })),
      finalizeChangelogUpdate: jest.fn<
        ChangelogRunDependencies['finalizeChangelogUpdate']
      >(() => ({
        llm: createLlmOutput(),
        updated: 'updated changelog',
      })),
      writeChangelog: jest.fn(),
      ensureGithubTokenRequired: jest.fn(),
      createPR: jest.fn<ChangelogRunDependencies['createPR']>(async () => 1),
    };

    await executeChangelogRun({ cli, appConfig, log, deps });

    expect(deps.fetchReleaseBody).not.toHaveBeenCalled();
    expect(deps.mapCommitsToPrs).toHaveBeenCalledWith(
      'octo',
      'repo',
      ['abcdef1234567890'],
      undefined,
      'https://api.github.com',
    );
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(deps.buildChangelogLlmOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseBody: 'release notes from cli',
        language: 'ja',
        customInstructions: 'combined instructions',
        prs: 'merged prs',
        existingChangelog: 'existing changelog',
        provider,
        noAi: false,
        requireProvider: false,
        failOnLlmError: false,
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
        'Prompt customization: requested=true, applied=false, sources=inline+file, chars=21/16000, encoding=utf8',
        'Prompt customization file: loaded (.github/changelog-instructions.md)',
        'Prompt customization reason: not applied because provider API key is missing',
      ].join('\n'),
    );
    expect(log).toHaveBeenNthCalledWith(3, '');
    expect(log).toHaveBeenNthCalledWith(4, 'updated changelog');
  });

  test('dry-run can print provider diagnostics as JSON report', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps: Partial<ChangelogRunDependencies> = {
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
      commitsInRange: jest.fn(() => []),
      prepareExistingChangelog: jest.fn(() => 'existing changelog'),
      resolveRunCredentials: jest.fn(async () => ({
        token: undefined,
        hasProviderKey: false,
      })),
      mapCommitsToPrs: jest.fn(async () => ({})),
      fetchReleaseBody: jest.fn<ChangelogRunDependencies['fetchReleaseBody']>(
        async () => '',
      ),
      resolveCustomInstructionsWithDiagnostics: jest.fn<
        ChangelogRunDependencies['resolveCustomInstructionsWithDiagnostics']
      >(() => unresolvedCustomization),
      buildPrMapBySha: jest.fn(() => ({})),
      buildTitleToPr: jest.fn(() => ({})),
      getProviderRuntimeConfig: jest.fn(() => appConfig.providers.openai),
      buildChangelogLlmOutput: jest.fn<
        ChangelogRunDependencies['buildChangelogLlmOutput']
      >(async () => ({
        llm: createLlmOutput(),
        aiUsed: false,
        fallbackReasons: ['AI disabled by --no-ai'],
      })),
      finalizeChangelogUpdate: jest.fn<
        ChangelogRunDependencies['finalizeChangelogUpdate']
      >(() => ({
        llm: createLlmOutput(),
        updated: 'updated changelog',
      })),
      writeChangelog: jest.fn(),
      ensureGithubTokenRequired: jest.fn(),
      createPR: jest.fn<ChangelogRunDependencies['createPR']>(async () => 1),
    };

    await executeChangelogRun({
      cli: { ...cli, dryRunJsonReport: true, noAi: true },
      appConfig,
      log,
      deps,
    });

    expect(JSON.parse(log.mock.calls[1][0])).toEqual({
      provider: 'openai',
      model: 'mock-openai',
      aiUsed: false,
      fallbackReasons: ['AI disabled by --no-ai'],
      promptCustomization: {
        ...unresolvedCustomization.diagnostics,
        applied: false,
        reason: 'not requested',
      },
    });
  });
});
