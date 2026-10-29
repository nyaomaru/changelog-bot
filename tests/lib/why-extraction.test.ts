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
      status: 'success',
      data: {
        number: 12,
        title: 'Restore draft release handling',
        body: [
          '## Why',
          '',
          'Because draft releases can be created first and published later, the workflow must listen to publication.',
        ].join('\n'),
        author: 'alice',
        url: 'https://github.com/octo/repo/pull/12',
      },
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
        status: 'success',
        data: {
          number: 12,
          title: 'Restore draft release handling',
          body: '## Why\nBecause draft releases can be published later and need coverage.',
          author: 'alice',
        },
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
        status: 'success',
        data: {
          number: 12,
          title: 'Restore draft release handling',
          body: '## Why\nBecause draft releases can be published later and need coverage.',
          author: 'alice',
        },
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
        status: 'success',
        data: {
          number: 12,
          title: 'Restore draft release handling',
          body: 'ドラフトリリースを後から公開する運用でも、公開時に変更履歴 PR を作れるようにするため。利用者がリリース後に変更内容を確認できるようにする。',
          author: 'alice',
        },
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
        status: 'success',
        data: {
          number: 12,
          title: 'Restore draft release handling',
          body: '## Why\nBecause draft releases can be published later and need coverage.',
          author: 'alice',
        },
      })),
    });

    expect(result.diagnostics.aiUsed).toBe(true);
    expect(result.diagnostics.notesRendered).toBe(0);
    expect(result.llm).toBe(llm);
  });

  test('renders WHY notes deterministically via buildSectionFromRelease when draft is provided', async () => {
    const selectedProvider = provider();
    jest.mocked(selectedProvider.extractWhyNotes).mockResolvedValue({
      items: [
        {
          prNumber: 12,
          why: 'Draft releases publish later and need the same changelog path.',
          confidence: 'high',
        },
      ],
    });
    const fetchPRDetails = jest.fn<FetchPRDetails>(async () => ({
      status: 'success',
      data: {
        number: 12,
        title: 'Restore draft release handling',
        body: [
          '## Why',
          '',
          'Because draft releases can be created first and published later, the workflow must listen to publication.',
        ].join('\n'),
        author: 'alice',
        url: 'https://github.com/octo/repo/pull/12',
      },
    }));

    const draft = {
      version: '1.2.3',
      date: '2026-10-04',
      changes: [
        {
          id: 'pr:12' as const,
          origin: { kind: 'pull-request' as const, number: 12 },
          title: 'Restore draft release handling',
          pr: 12,
          url: 'https://github.com/octo/repo/pull/12',
          author: 'alice',
        },
      ],
      assignments: {
        'pr:12': 'Fixed' as const,
      },
    };

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown: 'fallback section',
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: 'Generated changelog.',
      },
      draft,
      changelogAiUsed: true,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails,
    });

    expect(draft.changes[0].why).toBe(
      'Draft releases publish later and need the same changelog path.',
    );
    expect(result.llm.new_section_markdown).toContain(
      '## [v1.2.3] - 2026-10-04',
    );
    expect(result.llm.new_section_markdown).toContain('### Fixed');
    expect(result.llm.new_section_markdown).toContain(
      '- Restore draft release handling by @alice in [#12](https://github.com/octo/repo/pull/12)',
    );
    expect(result.llm.new_section_markdown).toContain(
      '  - Why: Draft releases publish later and need the same changelog path.',
    );
    expect(result.diagnostics.notesRendered).toBe(1);
  });

  test('enriches sub-changes with distinct WHY notes from a single PR fetch and renders both', async () => {
    const selectedProvider = provider();
    jest.mocked(selectedProvider.extractWhyNotes).mockResolvedValue({
      items: [
        {
          prNumber: 42,
          changeId: 'pr:42:c1',
          why: 'Enables single sign-on across enterprise identity providers.',
          confidence: 'high',
        },
        {
          prNumber: 42,
          changeId: 'pr:42:c2',
          why: 'Prevents intermittent session drops during concurrent token refreshes.',
          confidence: 'high',
        },
      ],
    });

    const fetchPRDetails = jest.fn<FetchPRDetails>(async () => ({
      status: 'success',
      data: {
        number: 42,
        title: 'feat: auth and session handling',
        body: [
          '## Why',
          '',
          'Because OAuth enables single sign-on across enterprise identity providers, and token refresh locking is needed to prevent intermittent session drops during concurrent refreshes.',
        ].join('\n'),
        author: 'alice',
        url: 'https://github.com/octo/repo/pull/42',
      },
    }));

    const draft = {
      version: '1.2.3',
      date: '2026-10-04',
      changes: [
        {
          id: 'pr:42:c1' as const,
          origin: {
            kind: 'pull-request-subchange' as const,
            number: 42,
            subIndex: 1,
          },
          title: 'add OAuth login provider',
          pr: 42,
          url: 'https://github.com/octo/repo/pull/42',
          author: 'alice',
        },
        {
          id: 'pr:42:c2' as const,
          origin: {
            kind: 'pull-request-subchange' as const,
            number: 42,
            subIndex: 2,
          },
          title: 'resolve race condition in token refresh',
          pr: 42,
          url: 'https://github.com/octo/repo/pull/42',
          author: 'alice',
        },
      ],
      assignments: {
        'pr:42:c1': 'Added' as const,
        'pr:42:c2': 'Fixed' as const,
      },
    };

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown: 'fallback section',
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: 'Generated changelog.',
      },
      draft,
      changelogAiUsed: true,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails,
    });

    // PR description fetched only ONCE despite two sub-change targets
    expect(fetchPRDetails).toHaveBeenCalledTimes(1);
    expect(fetchPRDetails).toHaveBeenCalledWith(
      'octo',
      'repo',
      42,
      'token',
      'https://api.github.com',
    );
    expect(result.diagnostics.prBodiesFetched).toBe(1);
    expect(result.diagnostics.notesRendered).toBe(2);

    expect(draft.changes[0].why).toBe(
      'Enables single sign-on across enterprise identity providers.',
    );
    expect(draft.changes[1].why).toBe(
      'Prevents intermittent session drops during concurrent token refreshes.',
    );

    expect(result.llm.new_section_markdown).toContain('### Added');
    expect(result.llm.new_section_markdown).toContain(
      '- add OAuth login provider by @alice in [#42](https://github.com/octo/repo/pull/42)',
    );
    expect(result.llm.new_section_markdown).toContain(
      '  - Why: Enables single sign-on across enterprise identity providers.',
    );

    expect(result.llm.new_section_markdown).toContain('### Fixed');
    expect(result.llm.new_section_markdown).toContain(
      '- resolve race condition in token refresh by @alice in [#42](https://github.com/octo/repo/pull/42)',
    );
    expect(result.llm.new_section_markdown).toContain(
      '  - Why: Prevents intermittent session drops during concurrent token refreshes.',
    );
  });

  test('records precise fallback reasons when PR metadata lookups fail or degrade', async () => {
    const selectedProvider = provider();
    const fetchPRDetails = jest.fn<FetchPRDetails>(
      async (_owner, _repo, prNumber) => {
        if (prNumber === 10) {
          return {
            status: 'not-found',
            message: 'PR #10 not found (404)',
            statusCode: 404,
          };
        }
        return {
          status: 'rate-limited',
          message: 'GitHub API rate limit exceeded: rate limit reached',
          statusCode: 429,
        };
      },
    );

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown: [
          '### Fixed',
          '',
          '- First fix [#10](https://github.com/octo/repo/pull/10)',
          '- Second fix [#11](https://github.com/octo/repo/pull/11)',
        ].join('\n'),
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: 'Generated changelog.',
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

    expect(result.diagnostics.prBodiesFetched).toBe(0);
    expect(result.diagnostics.fallbackReasons).toContain(
      'Skipped PR #10: PR not found (404)',
    );
    expect(result.diagnostics.fallbackReasons).toContain(
      'Skipped PR #11: GitHub API rate limit reached',
    );
  });

  test('bounds concurrent PR metadata lookups and deduplicates identical PR targets', async () => {
    let activeLookups = 0;
    let maxObservedActiveLookups = 0;
    const fetchPRDetails = jest.fn<FetchPRDetails>(
      async (_owner, _repo, prNumber) => {
        activeLookups += 1;
        maxObservedActiveLookups = Math.max(
          maxObservedActiveLookups,
          activeLookups,
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeLookups -= 1;
        return {
          status: 'success',
          data: {
            number: prNumber,
            title: `PR #${prNumber}`,
            body: '## Why\n\nExplicit rationale for this change.',
            author: 'alice',
            url: `https://github.com/octo/repo/pull/${prNumber}`,
          },
        };
      },
    );

    const selectedProvider = provider();
    await runWhyExtraction({
      cli: {
        ...cli,
        whyMaxPrs: 10,
      },
      llm: {
        new_section_markdown: [
          '### Added',
          '',
          '- Feat 1 [#1](https://github.com/octo/repo/pull/1)',
          '- Feat 1 duplicate [#1](https://github.com/octo/repo/pull/1)',
          '- Feat 2 [#2](https://github.com/octo/repo/pull/2)',
          '- Feat 3 [#3](https://github.com/octo/repo/pull/3)',
          '- Feat 4 [#4](https://github.com/octo/repo/pull/4)',
          '- Feat 5 [#5](https://github.com/octo/repo/pull/5)',
        ].join('\n'),
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: 'Generated changelog.',
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

    // 5 unique PRs despite 6 targets
    expect(fetchPRDetails).toHaveBeenCalledTimes(5);
    // Concurrency is bounded by GITHUB_METADATA_CONCURRENCY (4)
    expect(maxObservedActiveLookups).toBeLessThanOrEqual(4);
    expect(activeLookups).toBe(0);
  });
  test('preserves metadata diagnostics when provider returns no trusted notes', async () => {
    const selectedProvider = provider();
    jest.mocked(selectedProvider.extractWhyNotes).mockResolvedValue({
      items: [],
    });
    const fetchPRDetails = jest.fn<FetchPRDetails>(async () => ({
      status: 'success',
      data: {
        number: 12,
        title: 'PR #12',
        body: '## Why\n\nBecause draft releases can be created first and published later, the workflow must listen to publication.',
        author: 'alice',
        url: 'https://github.com/octo/repo/pull/12',
      },
    }));

    const result = await runWhyExtraction({
      cli,
      llm: {
        new_section_markdown: [
          '### Added',
          '',
          '- Feat [#12](https://github.com/octo/repo/pull/12)',
        ].join('\n'),
        pr_title: 'docs(changelog): 1.2.3',
        pr_body: 'body',
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

    expect(result.diagnostics.fallbackReasons).toContain(
      'WHY extraction skipped: provider returned no trusted notes',
    );
    expect(result.metadataDiagnostics).toBeDefined();
    expect(result.metadataDiagnostics?.totalLookups).toBe(1);
    expect(result.metadataDiagnostics?.successfulLookups).toBe(1);
    expect(result.metadataDiagnostics?.degradedLookups).toBe(0);
  });
});
