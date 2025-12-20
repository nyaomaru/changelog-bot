import type { Provider } from '@/types/provider.js';
import type { LLMInput, LLMOutput } from '@/types/llm.js';
import { LLMOutputSchema } from '@/schema/schema.js';
import { LlmError, ValidationError } from '@/lib/errors.js';
import { LLM_TRUNCATE_LIMIT } from '@/constants/prompt.js';

/**
 * Generate LLM output and enforce schema with a bounded retry using a repaired prompt.
 * WHY: Providers sometimes overrun budgets; retry with truncated inputs improves success odds.
 * @param provider Provider implementation to call.
 * @param input Normalized input payload.
 * @returns Validated LLM output conforming to the schema.
 */
export async function parseOrRetryLLMOutput(
  provider: Provider,
  input: LLMInput
): Promise<LLMOutput> {
  const attempts: LLMInput[] = [
    input,
    {
      ...input,
      releaseBody: input.releaseBody.slice(0, LLM_TRUNCATE_LIMIT),
      gitLog: input.gitLog.slice(0, LLM_TRUNCATE_LIMIT),
    },
  ];

  let lastErr: unknown;
  let lastWasProviderError = false;
  for (const attempt of attempts) {
    try {
      const raw = await provider.generate(attempt);
      const parsed = LLMOutputSchema.safeParse(raw as unknown);
      if (parsed.success) return parsed.data;
      lastErr = parsed.error;
      lastWasProviderError = false;
    } catch (e) {
      lastErr = e;
      lastWasProviderError = true;
      // Defer throwing until all attempts are exhausted to allow retry with truncated inputs.
    }
  }

  if (lastWasProviderError) {
    // Wrap provider errors for clearer upstream handling after retries.
    throw new LlmError(
      lastErr instanceof Error ? lastErr.message : 'Unknown LLM provider error'
    );
  }
  throw new ValidationError(
    'LLM output did not match schema after retry'
  );
}
