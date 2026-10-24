import { describe, expect, jest, test } from '@jest/globals';

import { loadAppConfig } from '@/lib/app-config.js';
import { JevWhyExtractor } from '@/providers/jev-why.js';
import { CliOptionsSchema } from '@/schema/cli.js';
import type { Provider } from '@/types/provider.js';
import { resolveWhyExtractor } from '@/utils/why-extractor.js';

const provider: Provider = {
  name: 'openai',
  modelName: 'test-model',
  supports: {
    jsonMode: true,
    streaming: false,
    reasoning: false,
    maxOutputTokens: 1,
  },
  generate: jest.fn<Provider['generate']>(),
  classifyChanges: jest.fn<Provider['classifyChanges']>(),
  extractWhyNotes: jest.fn<Provider['extractWhyNotes']>(),
};

function createCli(whyEngine: 'jev' | 'llm') {
  return CliOptionsSchema.parse({ provider: 'openai', whyEngine });
}

describe('resolveWhyExtractor', () => {
  test('returns a Jev extractor and reports a configured TypeSafe API key', () => {
    const result = resolveWhyExtractor(
      createCli('jev'),
      loadAppConfig({ TYPESAFE_API_KEY: 'typesafe-test' }),
      provider,
      false,
    );

    expect(result.extractor).toBeInstanceOf(JevWhyExtractor);
    expect(result.hasApiKey).toBe(true);
  });

  test('reports when the TypeSafe API key is missing', () => {
    const result = resolveWhyExtractor(
      createCli('jev'),
      loadAppConfig({}),
      provider,
      true,
    );

    expect(result.extractor).toBeInstanceOf(JevWhyExtractor);
    expect(result.hasApiKey).toBe(false);
  });

  test.each([true, false])(
    'returns the configured LLM provider and preserves hasProviderKey=%s',
    (hasProviderKey) => {
      const result = resolveWhyExtractor(
        createCli('llm'),
        loadAppConfig({ TYPESAFE_API_KEY: 'typesafe-test' }),
        provider,
        hasProviderKey,
      );

      expect(result.extractor).toBe(provider);
      expect(result.hasApiKey).toBe(hasProviderKey);
    },
  );
});
