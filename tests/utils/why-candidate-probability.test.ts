import { describe, expect, test } from '@jest/globals';

import { combinedWhyCandidateProbability } from '@/utils/why-candidate-probability.js';

describe('combinedWhyCandidateProbability', () => {
  test('uses the weaker explicitness or relevance probability', () => {
    expect(
      combinedWhyCandidateProbability({
        candidateIndex: 0,
        probability: 0.91,
        relevanceProbability: 0.42,
      }),
    ).toBe(0.42);
  });

  test('preserves legacy explicitness-only probabilities', () => {
    expect(
      combinedWhyCandidateProbability({ candidateIndex: 0, probability: 0.6 }),
    ).toBe(0.6);
  });
});
