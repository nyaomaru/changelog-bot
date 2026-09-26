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
            pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.91,
            },
            pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
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
            {
              candidateIndex: 0,
              probability: 0.42,
              relevanceProbability: 0.91,
            },
            {
              candidateIndex: 1,
              probability: 0.91,
              relevanceProbability: 0.91,
            },
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
        state: expect.objectContaining({
          candidates: expect.objectContaining({
            pr_123_candidate_0: expect.objectContaining({
              prNumber: 123,
              text: WHY_INPUT.items[0]?.candidates[0],
            }),
          }),
        }),
        questions: expect.objectContaining({
          pr_123_candidate_0_is_explicit_why: expect.objectContaining({
            type: 'noul',
            instructions: {
              question:
                'Does the target candidate explicitly state why this changelog change was made?',
              target: 'candidates.pr_123_candidate_0',
            },
            criteria: expect.objectContaining({
              true: expect.any(String),
              false: expect.any(String),
            }),
          }),
          pr_123_candidate_0_matches_change: expect.objectContaining({
            type: 'noul',
            instructions: {
              question:
                'Does the target candidate state a reason that applies to the identified changelog change?',
              target: 'candidates.pr_123_candidate_0',
            },
          }),
        }),
      }),
    );
  });

  test('targets each candidate uniquely when multiple PRs use the same index', async () => {
    const input: WhyExtractionInput = {
      ...WHY_INPUT,
      items: [
        WHY_INPUT.items[0] as WhyExtractionInput['items'][number],
        {
          prNumber: 456,
          title: 'Prevent stale version output',
          itemText: 'Prevent stale version output',
          sectionTitle: 'Fixed',
          trustScore: 9,
          trustBucket: 'high',
          requiresHighConfidence: false,
          candidates: [
            'The version must come from the release ref to avoid stale output.',
          ],
        },
      ],
    };
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_candidate_0_is_explicit_why: {
              type: 'noul',
              noul: 0.91,
            },
            pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.42,
            },
            pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
            pr_456_candidate_0_is_explicit_why: {
              type: 'noul',
              noul: 0.87,
            },
            pr_456_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
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

    await extractor.extractWhyNotes(input);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.state.candidates).toMatchObject({
      pr_123_candidate_0: expect.objectContaining({
        prNumber: 123,
        text: WHY_INPUT.items[0]?.candidates[0],
      }),
      pr_456_candidate_0: {
        prNumber: 456,
        prTitle: 'Prevent stale version output',
        changelogItem: 'Prevent stale version output',
        text: 'The version must come from the release ref to avoid stale output.',
      },
    });
    expect(requestBody.questions).toMatchObject({
      pr_123_candidate_0_is_explicit_why: {
        instructions: expect.objectContaining({
          target: 'candidates.pr_123_candidate_0',
        }),
      },
      pr_123_candidate_0_matches_change: {
        instructions: expect.objectContaining({
          target: 'candidates.pr_123_candidate_0',
        }),
      },
      pr_456_candidate_0_is_explicit_why: {
        instructions: expect.objectContaining({
          target: 'candidates.pr_456_candidate_0',
        }),
      },
      pr_456_candidate_0_matches_change: {
        instructions: expect.objectContaining({
          target: 'candidates.pr_456_candidate_0',
        }),
      },
    });
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
            pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.37,
            },
            pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
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
            {
              candidateIndex: 0,
              probability: 0.42,
              relevanceProbability: 0.91,
            },
            {
              candidateIndex: 1,
              probability: 0.37,
              relevanceProbability: 0.91,
            },
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
            pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
            pr_123_candidate_1_is_explicit_why: {
              type: 'noul',
              noul: 0.42,
            },
            pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
          },
          usage: { input_tokens: 123, output_tokens: 4 },
        }),
      ),
    );
    const extractor = new JevWhyExtractor({
      apiKey: 'typesafe-test',
      model: 'jev-latest',
    });

    await expect(extractor.extractWhyNotes(WHY_INPUT)).resolves.toMatchObject(
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

  test('rejects an explicit reason that does not apply to the changelog change', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            pr_123_candidate_0_is_explicit_why: { type: 'noul', noul: 0.91 },
            pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.18 },
            pr_123_candidate_1_is_explicit_why: { type: 'noul', noul: 0.42 },
            pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
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
            {
              candidateIndex: 0,
              probability: 0.91,
              relevanceProbability: 0.18,
            },
            {
              candidateIndex: 1,
              probability: 0.42,
              relevanceProbability: 0.91,
            },
          ],
        },
      ],
    });
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
          pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
          pr_123_candidate_1_is_explicit_why: {
            type: 'noul',
            noul: 0.91,
          },
          pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
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

  test('caps an unusually large Retry-After before retrying', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Request throttled', {
          status: 429,
          headers: { 'Retry-After': '3600' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'jev-latest',
            answers: {
              pr_123_candidate_0_is_explicit_why: {
                type: 'noul',
                noul: 0.42,
              },
              pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
              pr_123_candidate_1_is_explicit_why: {
                type: 'noul',
                noul: 0.91,
              },
              pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
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

    const extraction = extractor.extractWhyNotes(WHY_INPUT);

    await jest.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(extraction).resolves.toEqual(expect.any(Object));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('fails a request that does not respond before the timeout', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('request aborted')),
            { once: true },
          );
        }),
    );
    global.fetch = fetchMock;
    const extractor = new JevWhyExtractor({
      apiKey: 'typesafe-test',
      model: 'jev-latest',
    });

    const extraction = extractor.extractWhyNotes(WHY_INPUT);
    const rejection = expect(extraction).rejects.toThrow(
      'TypeSafe API request timed out after 30 seconds',
    );

    await jest.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await rejection;
  });

  test('keeps the timeout active while consuming a response body', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const stalledResponse = {
      ok: true,
      text: jest.fn(
        () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new Error('response body aborted')),
              { once: true },
            );
          }),
      ),
    } as unknown as Response;
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockImplementation((_input, init) => {
        signal = init?.signal;
        return Promise.resolve(stalledResponse);
      });
    global.fetch = fetchMock;
    const extractor = new JevWhyExtractor({
      apiKey: 'typesafe-test',
      model: 'jev-latest',
    });

    const extraction = extractor.extractWhyNotes(WHY_INPUT);
    const rejection = expect(extraction).rejects.toThrow(
      'TypeSafe API request timed out after 30 seconds',
    );

    await jest.advanceTimersByTimeAsync(29_999);
    expect(stalledResponse.text).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await rejection;
  });

  test('retries a throttled response without waiting for its stalled body', async () => {
    jest.useFakeTimers();
    let throttledResponseSignal: AbortSignal | null | undefined;
    const throttledResponse = {
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0' }),
      text: jest.fn(
        () =>
          new Promise<string>((_resolve, reject) => {
            throttledResponseSignal?.addEventListener(
              'abort',
              () => reject(new Error('response body aborted')),
              { once: true },
            );
          }),
      ),
    } as unknown as Response;
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockImplementationOnce((_input, init) => {
        throttledResponseSignal = init?.signal;
        return Promise.resolve(throttledResponse);
      })
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'jev-latest',
            answers: {
              pr_123_candidate_0_is_explicit_why: {
                type: 'noul',
                noul: 0.42,
              },
              pr_123_candidate_0_matches_change: { type: 'noul', noul: 0.91 },
              pr_123_candidate_1_is_explicit_why: {
                type: 'noul',
                noul: 0.91,
              },
              pr_123_candidate_1_matches_change: { type: 'noul', noul: 0.91 },
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

    const extraction = extractor.extractWhyNotes(WHY_INPUT);

    await jest.advanceTimersByTimeAsync(0);

    await expect(extraction).resolves.toEqual(expect.any(Object));
    expect(throttledResponse.text).not.toHaveBeenCalled();
    expect(throttledResponseSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
