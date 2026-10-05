// @ts-nocheck
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { GeminiProvider } from '@/providers/gemini.js';

const WHY_INPUT = {
  language: 'en',
  whyLabel: 'Why',
  items: [
    {
      prNumber: 123,
      title: 'Fix release lookup',
      itemText: 'Fix release lookup',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: ['The lookup must use the merged pull request.'],
    },
  ],
};

describe('GeminiProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('generates structured editorial output via generateContent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      changes: {
                        'pr:10': {
                          title: 'Add feature',
                          category: 'Added',
                        },
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
    });

    const provider = new GeminiProvider({
      apiKey: 'gemini-test',
      model: 'gemini-test-model',
    });

    const output = await provider.generate({
      repo: 'octo/repo',
      version: '1.0.0',
      date: '2026-05-23',
      releaseTag: 'v1.0.0',
      prevTag: 'v0.9.0',
      releaseBody: '',
      gitLog: 'abcdef1 feat: add feature',
      mergedPRs: '',
      changelogPreview: '',
      language: 'en',
      changes: [{ id: 'pr:10', title: 'raw title', category: 'Added' }],
    });

    expect(output).toEqual({
      changes: {
        'pr:10': {
          title: 'Add feature',
          category: 'Added',
        },
      },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-test',
        }),
      }),
    );
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.generationConfig).toEqual(
      expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: expect.any(Object),
      }),
    );
    expect(requestBody.generationConfig.responseFormat).toBeUndefined();
  });

  test('classifies changes by ID via generateContent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({ 'release-note:0': 'Added' }),
                  },
                ],
              },
            },
          ],
        }),
    });

    const provider = new GeminiProvider({
      apiKey: 'gemini-test',
      model: 'gemini-test-model',
    });

    const output = await provider.classifyChanges([
      { id: 'release-note:0', title: 'Add Gemini support' },
    ]);

    expect(output).toEqual({
      assignments: { 'release-note:0': 'Added' },
      diagnostics: [],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-test',
        }),
      }),
    );
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.generationConfig).toEqual(
      expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({
          type: 'object',
          required: ['release-note:0'],
          properties: {
            'release-note:0': expect.objectContaining({ type: 'string' }),
          },
          additionalProperties: false,
        }),
      }),
    );
    expect(requestBody.generationConfig.responseFormat).toBeUndefined();
  });

  test('throws classification parse errors when requested', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify({ 'release-note:0': ['Added'] }) },
                ],
              },
            },
          ],
        }),
    });

    const provider = new GeminiProvider({
      apiKey: 'gemini-test',
      model: 'gemini-test-model',
    });

    await expect(
      provider.classifyChanges(
        [{ id: 'release-note:0', title: 'Add Gemini support' }],
        { throwOnError: true },
      ),
    ).rejects.toThrow('Gemini classify output did not match schema');
  });

  test('keeps deterministic classification fallback by default', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify({ 'release-note:0': ['Added'] }) },
                ],
              },
            },
          ],
        }),
    });

    const provider = new GeminiProvider({
      apiKey: 'gemini-test',
      model: 'gemini-test-model',
    });

    await expect(
      provider.classifyChanges([
        { id: 'release-note:0', title: 'Add Gemini support' },
      ]),
    ).resolves.toEqual({
      assignments: { 'release-note:0': 'Added' },
      diagnostics: [
        'Gemini classify output did not match schema; used deterministic fallback for all changes',
      ],
    });
  });

  test('records token usage and served model from WHY extraction', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          modelVersion: 'gemini-1.5-pro-002',
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ items: [] }) }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 123,
            candidatesTokenCount: 45,
          },
        }),
    });
    const provider = new GeminiProvider({
      apiKey: 'gemini-test',
      model: 'gemini-test-model',
    });

    await provider.extractWhyNotes(WHY_INPUT);

    expect(provider.lastWhyExtractionUsage).toEqual({
      inputTokens: 123,
      outputTokens: 45,
    });
    expect(provider.lastServedModel).toBe('gemini-1.5-pro-002');
  });
});
