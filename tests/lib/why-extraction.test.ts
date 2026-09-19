import { describe, expect, jest, test } from '@jest/globals';

import { PROVIDER_OPENAI } from '@/constants/provider.js';
import { runWhyExtraction } from '@/lib/why-extraction.js';
import type { CliOptions } from '@/schema/cli.js';
import type { Provider } from '@/types/provider.js';

type FetchPRDetails = typeof import('@/lib/github.js').fetchPRDetails;

const cli: CliOptions = {
  repoPath: '.',
  changelogPath: 'CHANGELOG.md',
  baseBranch: 'main',
  provider: PROVIDER_OPENAI,
  releaseBody: '',
  language: 'en',
  dryRun: false,
  dryRunJsonReport: false,
  failOnLlmError: false,
  requireProvider: false,
  noAi: false,
  why: true,
  whyEngine: 'llm',
  whyMaxPrs: 30,
  whyMaxCharsPerPr: 800,
  whyConfidence: 'medium',
  whyLabel: 'Why',
};

function provider(): Provider {
  return {
    name: PROVIDER_OPENAI,
    modelName: 'mock',
    supports: {
      jsonMode: true,
      streaming: false,
      reasoning: false,
      maxOutputTokens: 1000,
    },
    generate: jest.fn<Provider['generate']>(async () => ({
      new_section_markdown: 'generated section',
      pr_title: 'docs(changelog): 1.2.3',
      pr_body: 'body',
    })),
    classifyChanges: jest.fn<Provider['classifyChanges']>(async () => ({
      assignments: {},
      diagnostics: [],
    })),
    extractWhyNotes: jest.fn<Provider['extractWhyNotes']>(async () => ({
      items: [
        {
          prNumber: 12,
          why: 'Draft releases publish later and need the same changelog path.',
          confidence: 'high' as const,
        },
      ],
    })),
  };
}

describe('runWhyExtraction', () => {
  test('fetches trusted PR bodies and renders accepted WHY notes', async () => {
    const selectedProvider = provider();
    jest.mocked(selectedProvider.extractWhyNotes).mockResolvedValue({
      items: [
        {
          prNumber: 12,
          why: 'Draft releases publish later and need the same changelog path.',
          confidence: 'high',
        },
      ],
      selectionDiagnostics: [
        {
          prNumber: 12,
          questionType: 'choice',
          selectedOption: 'candidate_0',
          selectedCandidateIndex: 0,
          selectionProbability: 0.91,
          confidence: 0.88,
          mappedConfidence: 'high',
          candidateProbabilities: [{ candidateIndex: 0, probability: 0.91 }],
        },
      ],
    });
    const fetchPRDetails = jest.fn<FetchPRDetails>(async () => ({
      number: 12,
      title: 'Restore draft release handling',
      body: [
        '## Why',
        '',
        'Because draft releases can be created first and published later, the workflow must listen to publication.',
      ].join('\n'),
      author: 'alice',
      url: 'https://github.com/octo/repo/pull/12',
    }));

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown: [
          '### Fixed',
          '',
          '- Restore draft release handling [#12](https://github.com/octo/repo/pull/12) by @alice',
        ].join('\n'),
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: [
          'Generated changelog.',
          '',
          'Note: Generated without LLM. Reason: provider unavailable.',
        ].join('\n'),
      },
      changelogAiUsed: true,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails,
    });

    expect(fetchPRDetails).toHaveBeenCalledWith(
      'octo',
      'repo',
      12,
      'token',
      'https://api.github.com',
    );
    expect(result.llm.new_section_markdown).toContain(
      '  - Why: Draft releases publish later and need the same changelog path.',
    );
    expect(result.llm.pr_body).toContain('### WHY preview');
    expect(result.llm.pr_body).not.toContain('Generated without LLM');
    expect(result.diagnostics.notesRendered).toBe(1);
    expect(result.diagnostics.aiUsed).toBe(true);
    expect(result.diagnostics.selectionDiagnostics).toEqual([
      expect.objectContaining({ prNumber: 12, mappedConfidence: 'high' }),
    ]);
  });

  test('skips WHY only when provider fails without fail-on-llm-error', async () => {
    const selectedProvider = provider();
    jest
      .mocked(selectedProvider.extractWhyNotes)
      .mockRejectedValue(new Error('provider unavailable'));

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown:
          '### Fixed\n\n- Restore draft release handling [#12](https://github.com/octo/repo/pull/12)',
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: [
          'Generated changelog.',
          '',
          'Note: Generated without LLM. Reason: provider unavailable.',
        ].join('\n'),
      },
      changelogAiUsed: false,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails: jest.fn<FetchPRDetails>(async () => ({
        number: 12,
        title: 'Restore draft release handling',
        body: '## Why\nBecause draft releases can be published later and need coverage.',
        author: 'alice',
      })),
    });

    expect(result.llm.new_section_markdown).not.toContain('  - Why:');
    expect(result.diagnostics.fallbackReasons.join('\n')).toContain(
      'WHY extraction skipped: provider unavailable',
    );
    expect(result.diagnostics.aiUsed).toBe(false);
    expect(result.llm.pr_body).toContain('Generated without LLM');
  });

  test('preserves a generation fallback note after independent WHY enrichment', async () => {
    const selectedProvider = provider();

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown:
          '### Fixed\n\n- Restore draft release handling [#12](https://github.com/octo/repo/pull/12)',
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: [
          'Generated changelog.',
          '',
          'Note: Generated without LLM. Reason: Missing API key for provider: openai.',
        ].join('\n'),
      },
      changelogAiUsed: false,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails: jest.fn<FetchPRDetails>(async () => ({
        number: 12,
        title: 'Restore draft release handling',
        body: '## Why\nBecause draft releases can be published later and need coverage.',
        author: 'alice',
      })),
    });

    expect(result.diagnostics.aiUsed).toBe(true);
    expect(result.diagnostics.notesRendered).toBe(1);
    expect(result.llm.pr_body).toContain('Generated without LLM');
    expect(result.llm.pr_body).toContain('### WHY preview');
  });

  test('requires high confidence for weakly structured non-English candidates', async () => {
    const selectedProvider = provider();
    jest.mocked(selectedProvider.extractWhyNotes).mockResolvedValue({
      items: [
        {
          prNumber: 12,
          why: 'Draft releases need the changelog path when published later.',
          confidence: 'medium',
        },
      ],
    });

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown:
          '### Fixed\n\n- Restore draft release handling [#12](https://github.com/octo/repo/pull/12)',
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: [
          'Generated changelog.',
          '',
          'Note: Generated without LLM.',
        ].join('\n'),
      },
      changelogAiUsed: true,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails: jest.fn<FetchPRDetails>(async () => ({
        number: 12,
        title: 'Restore draft release handling',
        body: 'ドラフトリリースを後から公開する運用でも、公開時に変更履歴 PR を作れるようにするため。利用者がリリース後に変更内容を確認できるようにする。',
        author: 'alice',
      })),
    });

    expect(result.diagnostics.aiUsed).toBe(true);
    expect(result.diagnostics.notesRendered).toBe(0);
    expect(result.llm.new_section_markdown).not.toContain('  - Why:');
    expect(result.llm.pr_body).not.toContain('Generated without LLM');
  });

  test('preserves the LLM output reference when successful extraction changes nothing', async () => {
    const selectedProvider = provider();
    jest.mocked(selectedProvider.extractWhyNotes).mockResolvedValue({
      items: [],
    });
    const llm = {
      new_section_markdown:
        '### Fixed\n\n- Restore draft release handling [#12](https://github.com/octo/repo/pull/12)',
      pr_title: 'docs(changelog): 1.2.3',
      pr_body: 'Generated changelog.',
    };

    const result = await runWhyExtraction({
      cli,
      llm,
      changelogAiUsed: true,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails: jest.fn<FetchPRDetails>(async () => ({
        number: 12,
        title: 'Restore draft release handling',
        body: '## Why\nBecause draft releases can be published later and need coverage.',
        author: 'alice',
      })),
    });

    expect(result.diagnostics.aiUsed).toBe(true);
    expect(result.diagnostics.notesRendered).toBe(0);
    expect(result.llm).toBe(llm);
  });
});
