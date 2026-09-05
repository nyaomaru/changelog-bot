import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { AnthropicProvider } from '@/providers/anthropic.js';

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
});
