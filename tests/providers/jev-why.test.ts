import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { JevWhyExtractor } from '@/providers/jev-why.js';
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
      candidates: [
        'The lookup must use the merged pull request to avoid stale release data.',
        'Updates release lookup code.',
      ],
    },
  ],
};

describe('JevWhyExtractor', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('renders only the source candidate selected by Jev', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_why_candidate: {
              type: 'choice',
              choice: 'candidate_0',
              probabilities: {
                none: 0.02,
                candidate_0: 0.91,
                candidate_1: 0.07,
              },
              confidence: 0.88,
            },
          },
          usage: { input_tokens: 123, output_tokens: 4 },
        }),
      ),
    );
    global.fetch = fetchMock;
    const extractor = new JevWhyExtractor({
      apiKey: 'typesafe-test',
      model: 'jev-latest',
    });

    const output = await extractor.extractWhyNotes(WHY_INPUT);

    expect(output).toEqual({
      items: [
        {
          prNumber: 123,
          why: WHY_INPUT.items[0]?.candidates[0],
          confidence: 'high',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer typesafe-test',
        }),
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: 'jev-latest',
        questions: expect.objectContaining({
          pr_123_why_candidate: expect.objectContaining({
            type: 'choice',
            criteria: expect.objectContaining({
              none: expect.any(String),
              candidate_0: WHY_INPUT.items[0]?.candidates[0],
            }),
          }),
        }),
      }),
    );
  });

  test('omits a PR when Jev selects none', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_why_candidate: {
              type: 'choice',
              choice: 'none',
              probabilities: {
                none: 0.92,
                candidate_0: 0.06,
                candidate_1: 0.02,
              },
              confidence: 0.89,
            },
          },
          usage: { input_tokens: 123, output_tokens: 4 },
        }),
      ),
    );
    const extractor = new JevWhyExtractor({
      apiKey: 'typesafe-test',
      model: 'jev-latest',
    });

    await expect(extractor.extractWhyNotes(WHY_INPUT)).resolves.toEqual({
      items: [],
    });
  });
});
