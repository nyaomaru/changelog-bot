import { describe, expect, jest, test } from '@jest/globals';
import { PROVIDER_OPENAI } from '@/constants/provider.js';
import { finalizeChangelogRunOutput } from '@/lib/changelog-run-output.js';
import type { ChangelogRunDependencies } from '@/lib/changelog-run.js';
import type { CliOptions } from '@/schema/cli.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';

const cli = {
  repoPath: '.',
  changelogPath: 'CHANGELOG.md',
  baseBranch: 'main',
  provider: PROVIDER_OPENAI,
  releaseBody: '',
  language: 'en',
  dryRun: true,
  dryRunJsonReport: false,
  failOnLlmError: false,
  requireProvider: false,
  noAi: false,
  why: true,
  whyMaxPrs: 30,
  whyMaxCharsPerPr: 800,
  whyConfidence: 'medium',
  whyLabel: 'Why',
} satisfies CliOptions;

const provider: Provider = {
  name: PROVIDER_OPENAI,
  modelName: 'mock-openai',
  supports: {
    jsonMode: true,
    streaming: false,
    reasoning: false,
    maxOutputTokens: 1000,
  },
  generate: async () => initialLlm,
  classifyChanges: async () => ({ assignments: {}, diagnostics: [] }),
  extractWhyNotes: async () => ({ items: [] }),
};

const initialLlm: LLMOutput = {
  new_section_markdown: 'generated section',
  pr_title: 'docs(changelog): 1.2.3',
  pr_body: 'body',
};

const whyDiagnostics = {
  enabled: true,
  aiUsed: true,
  targetsFound: 1,
  prBodiesFetched: 1,
  skippedBeforeFetch: 0,
  skippedLowTrust: 0,
  notesRendered: 1,
  fallbackReasons: [],
};

describe('finalizeChangelogRunOutput', () => {
  test('re-finalizes the changelog after WHY enrichment changes output', async () => {
    const enrichedLlm = {
      ...initialLlm,
      new_section_markdown: 'generated section\n\nWhy: useful context',
    };
    const finalizeChangelogUpdate = jest.fn<
      ChangelogRunDependencies['finalizeChangelogUpdate']
    >((params) => ({
      llm: params.llm,
      updated: `updated: ${params.llm.new_section_markdown}`,
    }));
    const runWhyExtraction = jest.fn<
      ChangelogRunDependencies['runWhyExtraction']
    >(async () => ({ llm: enrichedLlm, diagnostics: whyDiagnostics }));

    const result = await finalizeChangelogRunOutput({
      cli,
      llm: initialLlm,
      provider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      prevRef: 'v1.2.2',
      releaseRef: 'v1.2.3',
      version: '1.2.3',
      existingChangelog: 'existing changelog',
      titleToPr: {},
      token: 'token',
      githubApiBase: 'https://api.github.com',
      deps: {
        finalizeChangelogUpdate,
        runWhyExtraction,
        fetchPRDetails: jest.fn<ChangelogRunDependencies['fetchPRDetails']>(
          async () => null,
        ),
      },
    });

    expect(finalizeChangelogUpdate).toHaveBeenCalledTimes(2);
    expect(finalizeChangelogUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ llm: enrichedLlm }),
    );
    expect(result).toEqual({
      llm: enrichedLlm,
      updatedChangelog: `updated: ${enrichedLlm.new_section_markdown}`,
      whyDiagnostics,
    });
  });

  test('keeps the first finalized changelog when WHY extraction is unchanged', async () => {
    const finalizedLlm = { ...initialLlm };
    const finalizeChangelogUpdate = jest.fn<
      ChangelogRunDependencies['finalizeChangelogUpdate']
    >(() => ({ llm: finalizedLlm, updated: 'updated once' }));
    const runWhyExtraction = jest.fn<
      ChangelogRunDependencies['runWhyExtraction']
    >(async () => ({ llm: finalizedLlm, diagnostics: whyDiagnostics }));

    const result = await finalizeChangelogRunOutput({
      cli,
      llm: initialLlm,
      provider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      prevRef: 'v1.2.2',
      releaseRef: 'v1.2.3',
      version: '1.2.3',
      existingChangelog: 'existing changelog',
      titleToPr: {},
      githubApiBase: 'https://api.github.com',
      deps: {
        finalizeChangelogUpdate,
        runWhyExtraction,
        fetchPRDetails: jest.fn<ChangelogRunDependencies['fetchPRDetails']>(
          async () => null,
        ),
      },
    });

    expect(finalizeChangelogUpdate).toHaveBeenCalledTimes(1);
    expect(result.updatedChangelog).toBe('updated once');
  });
});
