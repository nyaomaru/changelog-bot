import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { AnthropicProvider } from '@/providers/anthropic.js';
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

describe('AnthropicProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('classifies changes by ID from structured tool output', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'tool_use',
              name: 'return_assignments',
              input: { 'release-note:0': 'Added' },
            },
          ],
        }),
      ),
    );
    global.fetch = fetchMock;
    const provider = new AnthropicProvider({
      apiKey: 'anthropic-test',
      model: 'claude-test-model',
    });

    const output = await provider.classifyChanges(
      [{ id: 'release-note:0', title: 'Add Anthropic support' }],
      { throwOnError: true },
    );

    expect(output).toEqual({
      assignments: { 'release-note:0': 'Added' },
      diagnostics: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': 'anthropic-test',
        }),
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: 'claude-test-model',
        max_tokens: 1000,
        tool_choice: { type: 'tool', name: 'return_assignments' },
      }),
    );
    expect(requestBody.tools[0].input_schema).toEqual(
      expect.objectContaining({
        required: ['release-note:0'],
        additionalProperties: false,
        properties: {
          'release-note:0': expect.objectContaining({ type: 'string' }),
        },
      }),
    );
  });

  test('records token usage from WHY extraction', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'tool_use',
              name: 'return_why_notes',
              input: { items: [] },
            },
          ],
          usage: { input_tokens: 123, output_tokens: 45 },
        }),
      ),
    );
    global.fetch = fetchMock;
    const provider = new AnthropicProvider({
      apiKey: 'anthropic-test',
      model: 'claude-test-model',
    });

    await provider.extractWhyNotes(WHY_INPUT);

    expect(provider.lastWhyExtractionUsage).toEqual({
      inputTokens: 123,
      outputTokens: 45,
    });
  });
});
