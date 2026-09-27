import { describe, expect, test } from '@jest/globals';

import { normalizeWhyExtractionUsage } from '@/utils/why-extraction-usage.js';

describe('normalizeWhyExtractionUsage', () => {
  test('returns complete numeric token accounting', () => {
    expect(
      normalizeWhyExtractionUsage({ inputTokens: 123, outputTokens: 45 }),
    ).toEqual({ inputTokens: 123, outputTokens: 45 });
  });

  test('omits incomplete or invalid token accounting', () => {
    expect(
      normalizeWhyExtractionUsage({
        inputTokens: 123,
        outputTokens: undefined,
      }),
    ).toBeUndefined();
    expect(
      normalizeWhyExtractionUsage({ inputTokens: '123', outputTokens: 45 }),
    ).toBeUndefined();
  });
});
