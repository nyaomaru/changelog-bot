// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { loadAppConfig } from '@/lib/app-config.js';
import { providerFactory } from '@/utils/provider.js';
import { OpenAIProvider } from '@/providers/openai.js';
import { AnthropicProvider } from '@/providers/anthropic.js';
import { GeminiProvider } from '@/providers/gemini.js';
import {
  PROVIDER_OPENAI,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
} from '@/constants/provider.js';

describe('providerFactory', () => {
  test('returns OpenAIProvider for openai', () => {
    const provider = providerFactory(
      PROVIDER_OPENAI,
      loadAppConfig({}).providers,
    );

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe(PROVIDER_OPENAI);
  });

  test('returns AnthropicProvider for anthropic', () => {
    const provider = providerFactory(
      PROVIDER_ANTHROPIC,
      loadAppConfig({}).providers,
    );

    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe(PROVIDER_ANTHROPIC);
  });

  test('returns GeminiProvider for gemini', () => {
    const provider = providerFactory(
      PROVIDER_GEMINI,
      loadAppConfig({}).providers,
    );

    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe(PROVIDER_GEMINI);
  });
});
