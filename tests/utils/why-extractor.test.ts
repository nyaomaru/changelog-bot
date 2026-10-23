import { describe, expect, jest, test } from '@jest/globals';

import { PROVIDER_OPENAI } from '@/constants/provider.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { JevWhyExtractor } from '@/providers/jev-why.js';
import type { CliOptions } from '@/schema/cli.js';
import type { Provider } from '@/types/provider.js';
import { resolveWhyExtractor } from '@/utils/why-extractor.js';

const baseCli: CliOptions = {
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

function createProvider(): Provider {
  return {
    name: PROVIDER_OPENAI,
    modelName: 'mock',
    supports: {
      jsonMode: true,
      streaming: false,
      reasoning: false,
      maxOutputTokens: 1000,
    },
    generate: jest.fn<Provider['generate']>(),
    classifyChanges: jest.fn<Provider['classifyChanges']>(),
    extractWhyNotes: jest.fn<Provider['extractWhyNotes']>(),
  };
}

describe('resolveWhyExtractor', () => {
  describe("whyEngine: 'jev'", () => {
    const jevCli: CliOptions = { ...baseCli, whyEngine: 'jev' };

    test('returns a JevWhyExtractor instead of the provider', () => {
      const provider = createProvider();
      const appConfig = loadAppConfig({ TYPESAFE_API_KEY: 'typesafe-test' });

      const { extractor } = resolveWhyExtractor(
        jevCli,
        appConfig,
        provider,
        true,
      );

      expect(extractor).toBeInstanceOf(JevWhyExtractor);
      expect(extractor).not.toBe(provider);
      expect(extractor.name).toBe('jev');
    });

    test('reports hasApiKey: true when the TypeSafe API key is configured', () => {
      const appConfig = loadAppConfig({ TYPESAFE_API_KEY: 'typesafe-test' });

      const { hasApiKey } = resolveWhyExtractor(
        jevCli,
        appConfig,
        createProvider(),
        false,
      );

      expect(hasApiKey).toBe(true);
    });

    test('reports hasApiKey: false when the TypeSafe API key is missing', () => {
      const appConfig = loadAppConfig({});

      const { hasApiKey } = resolveWhyExtractor(
        jevCli,
        appConfig,
        createProvider(),
        true,
      );

      expect(hasApiKey).toBe(false);
    });
  });

  describe("whyEngine: 'llm'", () => {
    const llmCli: CliOptions = { ...baseCli, whyEngine: 'llm' };

    test('returns the provider passed into the function', () => {
      const provider = createProvider();

      const { extractor } = resolveWhyExtractor(
        llmCli,
        loadAppConfig({ TYPESAFE_API_KEY: 'typesafe-test' }),
        provider,
        true,
      );

      expect(extractor).toBe(provider);
      expect(extractor).not.toBeInstanceOf(JevWhyExtractor);
    });

    test.each([true, false])(
      'preserves the supplied hasProviderKey value (%s)',
      (hasProviderKey) => {
        // WHY: The TypeSafe key is set to the opposite value to prove the llm
        // path ignores Jev credentials and only forwards hasProviderKey.
        const appConfig = loadAppConfig(
          hasProviderKey ? {} : { TYPESAFE_API_KEY: 'typesafe-test' },
        );

        const { hasApiKey } = resolveWhyExtractor(
          llmCli,
          appConfig,
          createProvider(),
          hasProviderKey,
        );

        expect(hasApiKey).toBe(hasProviderKey);
      },
    );
  });
});
