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
    jest.useRealTimers();
  });

  test('renders the candidate with the strongest explicit-WHY probability', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_candidate_0_is_explicit_why: {
              type: 'noul',
              noul: 0.42,
            },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.91,
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
          why: WHY_INPUT.items[0]?.candidates[1],
          confidence: 'high',
        },
      ],
      selectionDiagnostics: [
        {
          prNumber: 123,
          questionType: 'noul',
          selectedOption: 'candidate_1',
          selectedCandidateIndex: 1,
          selectionProbability: 0.91,
          mappedConfidence: 'high',
          candidateProbabilities: [
            { candidateIndex: 0, probability: 0.42 },
            { candidateIndex: 1, probability: 0.91 },
          ],
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
          pr_123_candidate_0_is_explicit_why: expect.objectContaining({
            type: 'noul',
            criteria: expect.objectContaining({
              true: expect.any(String),
              false: expect.any(String),
            }),
          }),
        }),
      }),
    );
  });

  test('omits a PR when no candidate meets the minimum probability', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_candidate_0_is_explicit_why: {
              type: 'noul',
              noul: 0.42,
            },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.37,
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
      selectionDiagnostics: [
        {
          prNumber: 123,
          questionType: 'noul',
          selectedOption: 'none',
          selectionProbability: 0.42,
          mappedConfidence: 'low',
          candidateProbabilities: [
            { candidateIndex: 0, probability: 0.42 },
            { candidateIndex: 1, probability: 0.37 },
          ],
        },
      ],
    });
  });

  test('maps the initial medium threshold to a 0.60 Noul probability', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_candidate_0_is_explicit_why: {
              type: 'noul',
              noul: 0.6,
            },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.42,
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

    await expect(extractor.extractWhyNotes(WHY_INPUT)).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            prNumber: 123,
            confidence: 'medium',
          }),
        ],
        selectionDiagnostics: [
          expect.objectContaining({
            selectionProbability: 0.6,
            mappedConfidence: 'medium',
          }),
        ],
      }),
    );
  });

  test('honors Retry-After before retrying a throttled TypeSafe request', async () => {
    jest.useFakeTimers();
    const successfulResponse = new Response(
      JSON.stringify({
        model: 'jev-latest',
        answers: {
          pr_123_candidate_0_is_explicit_why: {
            type: 'noul',
            noul: 0.42,
          },
          pr_123_candidate_1_is_explicit_why: {
            type: 'noul',
            noul: 0.91,
          },
        },
        usage: { input_tokens: 123, output_tokens: 4 },
      }),
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Request throttled', {
          status: 429,
          headers: { 'Retry-After': '3' },
        }),
      )
      .mockResolvedValueOnce(successfulResponse);
    global.fetch = fetchMock;
    const extractor = new JevWhyExtractor({
      apiKey: 'typesafe-test',
      model: 'jev-latest',
    });

    const extraction = extractor.extractWhyNotes(WHY_INPUT);

    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(extraction).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            why: WHY_INPUT.items[0]?.candidates[1],
          }),
        ],
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
