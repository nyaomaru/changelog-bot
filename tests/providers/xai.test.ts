import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { XAIProvider } from '@/providers/xai.js';
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
      candidates: ['The lookup must use the merged pull request.'],
    },
  ],
};

describe('XAIProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('generates structured editorial output via Chat Completions API', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  changes: {
                    'pr:10': {
                      title: 'Polished grok feature title',
                      category: 'Added',
                    },
                  },
                }),
              },
            },
          ],
        }),
      ),
    );
    global.fetch = fetchMock;

    const provider = new XAIProvider({
      apiKey: 'xai-test-key',
      model: 'grok-4.7',
    });

    const input = {
      repo: 'octo/repo',
      version: '1.0.0',
      date: '2026-10-06',
      releaseTag: 'v1.0.0',
      prevTag: 'v0.9.0',
      releaseBody: '',
      gitLog: 'abcdef1 feat: add xAI provider',
      mergedPRs: '',
      changelogPreview: '',
      language: 'en',
      changes: [{ id: 'pr:10', title: 'raw title', category: 'Added' }],
    };

    const output = await provider.generate(input);

    expect(output).toEqual({
      changes: {
        'pr:10': {
          title: 'Polished grok feature title',
          category: 'Added',
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer xai-test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: 'grok-4.7',
        max_tokens: expect.any(Number),
        temperature: expect.any(Number),
        response_format: { type: 'json_object' },
        messages: expect.any(Array),
      }),
    );

    const userMessageContent = JSON.parse(requestBody.messages[1].content);
    expect(userMessageContent.changes).toEqual([
      { id: 'pr:10', title: 'raw title', category: 'Added' },
    ]);
    expect(userMessageContent.requiredJsonSchema.required).toContain('changes');
  });

  test('classifies changes by ID via Chat Completions API', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({ 'pr:10': 'Added' }),
              },
            },
          ],
        }),
      ),
    );
    global.fetch = fetchMock;

    const provider = new XAIProvider({
      apiKey: 'xai-test-key',
      model: 'grok-4.7',
    });

    const result = await provider.classifyChanges([
      { id: 'pr:10', title: 'Add xAI provider support' },
    ]);

    expect(result.assignments).toEqual({ 'pr:10': 'Added' });
    expect(result.diagnostics).toEqual([]);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.messages[0].content).toContain(
      'Classify each release change',
    );
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
  });

  test('falls back to deterministic classification when apiKey is missing', async () => {
    const provider = new XAIProvider({
      apiKey: undefined,
      model: 'grok-4.7',
    });

    const result = await provider.classifyChanges([
      { id: 'pr:10', title: 'fix: handle xAI error gracefully' },
    ]);

    expect(result.assignments).toEqual({ 'pr:10': 'Fixed' });
    expect(result.diagnostics).toEqual([]);
  });

  test('extracts WHY notes and records token usage and served model', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'grok-4.7-served',
          usage: {
            input_tokens: 150,
            output_tokens: 45,
          },
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  items: [
                    {
                      prNumber: 123,
                      why: 'The lookup must use the merged pull request.',
                      confidence: 'high',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      ),
    );
    global.fetch = fetchMock;

    const provider = new XAIProvider({
      apiKey: 'xai-test-key',
      model: 'grok-4.7',
    });

    const output = await provider.extractWhyNotes(WHY_INPUT);

    expect(output.items).toEqual([
      expect.objectContaining({
        prNumber: 123,
        why: 'The lookup must use the merged pull request.',
        confidence: 'high',
      }),
    ]);
    expect(provider.lastServedModel).toBe('grok-4.7-served');
    expect(provider.lastWhyExtractionUsage).toEqual({
      inputTokens: 150,
      outputTokens: 45,
    });
  });

  test('returns empty WHY notes without calling API when items are empty', async () => {
    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;

    const provider = new XAIProvider({
      apiKey: 'xai-test-key',
      model: 'grok-4.7',
    });

    const output = await provider.extractWhyNotes({
      language: 'en',
      whyLabel: 'Why',
      items: [],
    });

    expect(output).toEqual({ items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.lastWhyExtractionUsage).toBeUndefined();
    expect(provider.lastServedModel).toBeUndefined();
  });
});
