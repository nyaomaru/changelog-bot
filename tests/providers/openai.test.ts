import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { OpenAIProvider } from '@/providers/openai.js';
import type { WhyExtractionInput } from '@/types/why.js';

const WHY_INPUT: WhyExtractionInput = {
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
      candidates: ['Why: The lookup must use the merged pull request.'],
    },
  ],
};

describe('OpenAIProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('extracts WHY notes from reasoning models via the Responses API', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            items: [
              {
                prNumber: 123,
                why: 'The lookup must use the merged pull request.',
                confidence: 'high',
              },
            ],
          }),
        }),
      ),
    );
    global.fetch = fetchMock;
    const provider = new OpenAIProvider({
      apiKey: 'openai-test',
      model: 'o3-mini',
    });

    const output = await provider.extractWhyNotes(WHY_INPUT);

    expect(output.items).toEqual([
      expect.objectContaining({ prNumber: 123, confidence: 'high' }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: 'o3-mini',
        max_output_tokens: 800,
        reasoning: { effort: 'medium' },
        input: expect.any(Array),
      }),
    );
    expect(requestBody).not.toHaveProperty('max_tokens');
    expect(requestBody).not.toHaveProperty('temperature');
    expect(requestBody).not.toHaveProperty('messages');
  });

  test('keeps non-reasoning WHY extraction on Chat Completions', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ items: [] }),
              },
            },
          ],
        }),
      ),
    );
    global.fetch = fetchMock;
    const provider = new OpenAIProvider({
      apiKey: 'openai-test',
      model: 'gpt-4o-mini',
    });

    await provider.extractWhyNotes(WHY_INPUT);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        temperature: 0,
        messages: expect.any(Array),
        response_format: { type: 'json_object' },
      }),
    );
    expect(requestBody).not.toHaveProperty('max_output_tokens');
    expect(requestBody).not.toHaveProperty('reasoning');
  });

  test('classifies changes by ID from reasoning models via the Responses API', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({ 'release-note:0': 'Fixed' }),
        }),
      ),
    );
    global.fetch = fetchMock;
    const provider = new OpenAIProvider({
      apiKey: 'openai-test',
      model: 'gpt-5.1-reasoning',
    });

    const output = await provider.classifyChanges(
      [{ id: 'release-note:0', title: 'Fix release lookup' }],
      { throwOnError: true },
    );

    expect(output).toEqual({
      assignments: { 'release-note:0': 'Fixed' },
      diagnostics: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: 'gpt-5.1-reasoning',
        max_output_tokens: 1000,
        reasoning: { effort: 'medium' },
      }),
    );
    expect(requestBody).not.toHaveProperty('max_tokens');
    expect(requestBody).not.toHaveProperty('temperature');
  });

  test('generate sends canonical changes with stable IDs and parses EditorialOutput', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            changes: {
              'pr:10': { title: 'Polished title', category: 'Added' },
            },
          }),
        }),
      ),
    );
    global.fetch = fetchMock;
    const provider = new OpenAIProvider({
      apiKey: 'openai-test',
      model: 'gpt-5.1-reasoning',
    });

    const input = {
      repo: 'octo/repo',
      version: '1.0.0',
      date: '2026-10-04',
      releaseTag: 'v1.0.0',
      prevTag: 'v0.9.0',
      releaseBody: '',
      gitLog: '',
      mergedPRs: '',
      changelogPreview: '',
      language: 'en',
      changes: [{ id: 'pr:10', title: 'raw title', category: 'Added' }],
    };

    const output = await provider.generate(input);

    expect(output).toEqual({
      changes: {
        'pr:10': { title: 'Polished title', category: 'Added' },
      },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const userPromptContent = JSON.parse(requestBody.input[1]?.content ?? '{}');
    expect(userPromptContent.changes).toEqual([
      { id: 'pr:10', title: 'raw title', category: 'Added' },
    ]);
    expect(userPromptContent.requiredJsonSchema.required).toContain('changes');
  });

  test('rejects legacy full-generation response missing changes property', async () => {
    const { EditorialOutputSchema } = await import('@/schema/editorial.js');
    const legacyResponse = {
      new_section_markdown: '### Added\n- Something',
      pr_title: 'docs: release',
      pr_body: 'summary',
    };
    const parsed = EditorialOutputSchema.safeParse(legacyResponse);
    expect(parsed.success).toBe(false);
  });
});
