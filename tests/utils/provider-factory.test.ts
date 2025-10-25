// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { providerFactory } from '@/utils/provider.js';
import { OpenAIProvider } from '@/providers/openai.js';
import { AnthropicProvider } from '@/providers/anthropic.js';
import { PROVIDER_OPENAI, PROVIDER_ANTHROPIC } from '@/constants/provider.js';

describe('providerFactory', () => {
  test('returns OpenAIProvider for openai', () => {
    const provider = providerFactory(PROVIDER_OPENAI);

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe(PROVIDER_OPENAI);
  });

  test('returns AnthropicProvider for anthropic', () => {
    const provider = providerFactory(PROVIDER_ANTHROPIC);

    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe(PROVIDER_ANTHROPIC);
  });
});
