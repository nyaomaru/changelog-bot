// @ts-nocheck
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { GeminiProvider } from '@/providers/gemini.js';

describe('GeminiProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('generates structured changelog output via generateContent', async () => {
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
                      new_section_markdown: '## [v1.0.0] - 2026-05-23',
                      insert_after_anchor: '## [Unreleased]',
                      pr_title: 'docs(changelog): 1.0.0',
                      pr_body: 'Update changelog.',
                      labels: ['changelog'],
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
    });

    expect(output.pr_title).toBe('docs(changelog): 1.0.0');
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

  test('classifies titles via generateContent', async () => {
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
                      Added: ['Add Gemini support'],
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

    const output = await provider.classifyTitles(['Add Gemini support']);

    expect(output).toEqual({ Added: ['Add Gemini support'] });
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
                parts: [{ text: JSON.stringify({ Added: 'not-array' }) }],
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
      provider.classifyTitles(['Add Gemini support'], { throwOnError: true }),
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
                parts: [{ text: JSON.stringify({ Added: 'not-array' }) }],
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
      provider.classifyTitles(['Add Gemini support']),
    ).resolves.toEqual({
      Chore: ['Add Gemini support'],
    });
  });
});
