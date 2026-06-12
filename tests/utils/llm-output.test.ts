// @ts-nocheck
import { describe, expect, test, jest } from '@jest/globals';

// With ESM + ts-jest, mock modules before importing the SUT using unstable_mockModule.
await jest.unstable_mockModule('@/utils/classify.js', () => ({
  classifyTitles: jest.fn(async () => ({ Added: ['Add feature'] })),
}));

const { buildChangelogLlmOutput } = await import('@/utils/llm-output.js');
const { LlmError } = await import('@/lib/errors.js');

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
    noAi: false,
    requireProvider: false,
    failOnLlmError: false,
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

  test('no-ai uses release notes without provider classification', async () => {
    const classifyTitles = jest.fn(async () => {
      throw new Error('classification should be skipped');
    });

    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        releaseBody: "## What's Changed\n- Add feature\n",
        provider: { ...mockProvider, classifyTitles },
        hasProviderKey: true,
        noAi: true,
      }),
    );

    expect(classifyTitles).not.toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.fallbackReasons).toEqual(
      expect.arrayContaining([
        'AI disabled by --no-ai',
        'Used GitHub Release Notes as the source (no model call)',
      ]),
    );
    expect(result.llm.pr_body).toContain('Generated without LLM');
    expect(result.llm.new_section_markdown).toContain('- Add feature');
  });

  test('require-provider fails when the selected provider has no key', async () => {
    await expect(
      buildChangelogLlmOutput(
        buildBaseParams({
          releaseBody: "## What's Changed\n- Add feature\n",
          requireProvider: true,
        }),
      ),
    ).rejects.toThrow(LlmError);
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

  test('uses model path when non-default language is set with release notes', async () => {
    const generate = jest.fn(async (input) => ({
      new_section_markdown: `## [v${input.version}] - ${input.date}\n### Added\n- 日本語の出力`,
      insert_after_anchor: '## [Unreleased]',
      pr_title: `docs(changelog): ${input.version}`,
      pr_body: 'Localized changelog.',
      labels: ['changelog'],
    }));
    const providerWithModel = { ...mockProvider, generate };

    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        releaseBody: "## What's Changed\n- Add feature\n",
        language: 'ja',
        provider: providerWithModel,
        providerConfig: { apiKey: 'sk-test', model: 'mock-model' },
        hasProviderKey: true,
      }),
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseBody: "## What's Changed\n- Add feature\n",
        language: 'ja',
      }),
    );
    expect(result.aiUsed).toBe(true);
    expect(result.fallbackReasons).not.toContain(
      'Used GitHub Release Notes as the source (no model call)',
    );
    expect(result.llm.new_section_markdown).toContain('日本語の出力');
  });

  test('falls back when mocked provider generation fails by default', async () => {
    const generate = jest.fn(async () => {
      throw new Error('provider down');
    });
    const providerWithFailure = { ...mockProvider, generate };

    const result = await buildChangelogLlmOutput(
      buildBaseParams({
        commitList: [{ sha: 'abcdef1', subject: 'fix: patch bug' }],
        provider: providerWithFailure,
        providerConfig: { apiKey: 'sk-test', model: 'mock-model' },
        hasProviderKey: true,
      }),
    );

    expect(generate).toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.fallbackReasons.join('\n')).toContain(
      'LLM generation failed: provider down',
    );
    expect(result.llm.new_section_markdown).toContain('### Fixed');
  });

  test('fail-on-llm-error throws when mocked provider generation fails', async () => {
    const generate = jest.fn(async () => {
      throw new Error('provider down');
    });
    const providerWithFailure = { ...mockProvider, generate };

    await expect(
      buildChangelogLlmOutput(
        buildBaseParams({
          provider: providerWithFailure,
          providerConfig: { apiKey: 'sk-test', model: 'mock-model' },
          hasProviderKey: true,
          failOnLlmError: true,
        }),
      ),
    ).rejects.toThrow(LlmError);
  });

  test('fail-on-llm-error throws when mocked release-note classification fails', async () => {
    const classifyTitles = jest.fn(async () => {
      throw new Error('classifier down');
    });

    await expect(
      buildChangelogLlmOutput(
        buildBaseParams({
          releaseBody: "## What's Changed\n- Add feature\n",
          provider: { ...mockProvider, classifyTitles },
          hasProviderKey: true,
          failOnLlmError: true,
        }),
      ),
    ).rejects.toThrow(LlmError);
  });
});
