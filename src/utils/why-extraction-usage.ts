import type { WhyExtractionUsage } from '@/types/why-extractor.js';
import { isNumber } from '@/utils/is.js';

/**
 * Normalize optional token accounting returned by a WHY extraction provider.
 * @param usage Provider-specific input and output token values.
 * @returns Token usage when both values are valid numbers, otherwise undefined.
 */
export function normalizeWhyExtractionUsage(usage: {
  inputTokens: unknown;
  outputTokens: unknown;
}): WhyExtractionUsage | undefined {
  if (!isNumber(usage.inputTokens) || !isNumber(usage.outputTokens)) {
    return undefined;
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}
