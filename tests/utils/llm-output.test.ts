// @ts-nocheck
import { describe, expect, test, jest } from '@jest/globals';

// With ESM + ts-jest, mock modules before importing the SUT using unstable_mockModule.
await jest.unstable_mockModule('@/utils/classify.js', () => ({
  classifyTitles: jest.fn(async () => ({ Added: ['Add feature'] })),
}));

const { buildChangelogLlmOutput } = await import('@/utils/llm-output.js');

const mockProvider = {
  name: 'openai',
  modelName: 'mock',
  supports: {
    jsonMode: true,
    streaming: false,
    reasoning: false,
    maxOutputTokens: 1000,
  },
  generate: async () => {
    throw new Error('Unexpected model call');
  },
  classifyTitles: async () => ({ Added: ['Add feature'] }),
};

const mockProviderConfig = {
  apiKey: undefined,
  model: 'mock-model',
};

function buildBaseParams(overrides = {}) {
  return {
    owner: 'octo',
    repo: 'repo',
    version: '1.0.0',
    date: '2024-01-01',
    releaseRef: 'v1.0.0',
    prevRef: 'v0.9.0',
    releaseBody: '',
    language: 'en',
    existingChangelog: '',
    commitList: [],
    prs: '',
    prMapBySha: {},
    titleToPr: {},
    provider: mockProvider,
    providerConfig: mockProviderConfig,
    hasProviderKey: false,
    token: undefined,
    githubApiBase: 'https://api.github.com',
    ...overrides,
  };
}

describe('llm-output', () => {
  test('falls back when no provider key and no release notes', async () => {
    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        commitList: [{ sha: 'abcdef1', subject: 'feat: add feature' }],
      }),
    );

    expect(result.fallbackReasons).toContain(
      'Missing API key for provider: openai',
    );
    expect(result.llm.pr_body).toContain('Auto-generated CHANGELOG (fallback)');
    expect(result.llm.pr_body).toContain('Generated without LLM');
    expect(result.llm.new_section_markdown).toContain(
      '## [v1.0.0] - 2024-01-01',
    );
    expect(result.llm.new_section_markdown).toContain('### Added');
    expect(result.llm.new_section_markdown).toContain('- add feature');
  });

  test('builds output from release notes without a provider key', async () => {
    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        releaseBody: "## What's Changed\n- Add feature\n",
      }),
    );

    expect(result.fallbackReasons).toContain(
      'Used GitHub Release Notes as the source (no model call)',
    );
    expect(result.llm.pr_body).toContain('Generated without LLM');
    expect(result.llm.new_section_markdown).toContain(
      '## [v1.0.0] - 2024-01-01',
    );
    expect(result.llm.new_section_markdown).toContain('### Added');
    expect(result.llm.new_section_markdown).toContain('- Add feature');
  });

  test('preserves custom release-note sections when no items are parsed', async () => {
    const whatsNewHeading = 'What\u2019s New \u{1F680}';
    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        releaseBody: [
          `## ${whatsNewHeading}`,
          'Introduces the `assert` helper and usage examples.',
          '',
          '**Full Changelog**: v0.9.0...v1.0.0',
        ].join('\n'),
      }),
    );

    expect(result.fallbackReasons).toContain(
      'Used GitHub Release Notes as the source (no model call)',
    );
    expect(result.llm.new_section_markdown).toContain(
      '## [v1.0.0] - 2024-01-01',
    );
    expect(result.llm.new_section_markdown).toContain(`### ${whatsNewHeading}`);
    expect(result.llm.new_section_markdown).toContain(
      'Introduces the `assert` helper and usage examples.',
    );
    expect(result.llm.new_section_markdown).toContain(
      '**Full Changelog**: https://github.com/octo/repo/compare/v0.9.0...v1.0.0',
    );
  });

  test('keeps fallback note when provider key exists but release notes have no items', async () => {
    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        releaseBody: [
          '## What\u2019s New',
          'User-facing highlights only.',
          '',
          '**Full Changelog**: v0.9.0...v1.0.0',
        ].join('\n'),
        hasProviderKey: true,
      }),
    );

    expect(result.aiUsed).toBe(false);
    expect(result.llm.pr_body).toContain('Generated without LLM');
    expect(result.llm.new_section_markdown).toContain('### What\u2019s New');
  });

  test('uses model path when custom instructions are set with release notes', async () => {
    const generate = jest.fn(async (input) => ({
      new_section_markdown: `## [v${input.version}] - ${input.date}\n### Added\n- Customized output`,
      insert_after_anchor: '## [Unreleased]',
      pr_title: `docs(changelog): ${input.version}`,
      pr_body: 'Customized changelog.',
      labels: ['changelog'],
    }));
    const providerWithModel = { ...mockProvider, generate };

    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        releaseBody: "## What's Changed\n- Add feature\n",
        customInstructions: 'Write in Japanese.',
        provider: providerWithModel,
        providerConfig: { apiKey: 'sk-test', model: 'mock-model' },
        hasProviderKey: true,
      }),
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseBody: "## What's Changed\n- Add feature\n",
        customInstructions: 'Write in Japanese.',
      }),
    );
    expect(result.aiUsed).toBe(true);
    expect(result.fallbackReasons).not.toContain(
      'Used GitHub Release Notes as the source (no model call)',
    );
    expect(result.llm.new_section_markdown).toContain('Customized output');
  });
});
