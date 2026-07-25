import { describe, expect, jest, test } from '@jest/globals';

import { classifyTitlesWithFallback } from '@/providers/classification.js';

describe('classifyTitlesWithFallback', () => {
  test('returns an empty map without requesting classification for empty input', async () => {
    const request = jest.fn<() => Promise<string>>();

    const result = await classifyTitlesWithFallback({
      titles: [],
      hasApiKey: true,
      request,
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({});
    expect(request).not.toHaveBeenCalled();
  });

  test('uses the deterministic fallback without a provider key', async () => {
    const request = jest.fn<() => Promise<string>>();

    const result = await classifyTitlesWithFallback({
      titles: ['Update dependencies'],
      hasApiKey: false,
      request,
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({ Chore: ['Update dependencies'] });
    expect(request).not.toHaveBeenCalled();
  });

  test('parses a valid provider response', async () => {
    const result = await classifyTitlesWithFallback({
      titles: ['Fix release lookup'],
      hasApiKey: true,
      request: async () => JSON.stringify({ Fixed: ['Fix release lookup'] }),
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({ Fixed: ['Fix release lookup'] });
  });

  test('falls back when the provider request fails', async () => {
    const result = await classifyTitlesWithFallback({
      titles: ['Update dependencies'],
      hasApiKey: true,
      request: async () => {
        throw new Error('Provider unavailable');
      },
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({ Chore: ['Update dependencies'] });
  });

  test('propagates invalid provider responses when requested', async () => {
    await expect(
      classifyTitlesWithFallback({
        titles: ['Fix release lookup'],
        hasApiKey: true,
        options: { throwOnError: true },
        request: async () => '{}',
        invalidResponseMessage: 'Invalid provider response',
      }),
    ).rejects.toThrow('Invalid provider response');
  });
});
