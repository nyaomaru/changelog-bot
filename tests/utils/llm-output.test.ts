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
};

describe('llm-output', () => {
  test('falls back when no provider key and no release notes', async () => {
    const result = await buildChangelogLlmOutput({
      owner: 'octo',
      repo: 'repo',
      version: '1.0.0',
      date: '2024-01-01',
      releaseRef: 'v1.0.0',
      prevRef: 'v0.9.0',
      releaseBody: '',
      existingChangelog: '',
      commitList: [{ sha: 'abcdef1', subject: 'feat: add feature' }],
      prs: '',
      prMapBySha: {},
      titleToPr: {},
      provider: mockProvider,
      hasProviderKey: false,
      token: undefined,
    });

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
    const result = await buildChangelogLlmOutput({
      owner: 'octo',
      repo: 'repo',
      version: '1.0.0',
      date: '2024-01-01',
      releaseRef: 'v1.0.0',
      prevRef: 'v0.9.0',
      releaseBody: "## What's Changed\n- Add feature\n",
      existingChangelog: '',
      commitList: [],
      prs: '',
      prMapBySha: {},
      titleToPr: {},
      provider: mockProvider,
      hasProviderKey: false,
      token: undefined,
    });

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
});
