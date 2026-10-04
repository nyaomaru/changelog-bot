import type { Provider } from '@/types/provider.js';
import type { LLMInput } from '@/types/llm.js';
import {
  EditorialOutputSchema,
  type EditorialOutput,
} from '@/schema/editorial.js';
import { LlmError, ValidationError } from '@/lib/errors.js';
import { LLM_TRUNCATE_LIMIT } from '@/constants/prompt.js';
import { isError } from '@/utils/is.js';

/**
 * Generate LLM editorial output and enforce schema with a bounded retry.
 * WHY: In Phase 4, providers must return sparse editorial output matching EditorialOutputSchema.
 * Legacy full-generation output missing the required changes dictionary is rejected.
 * @param provider Provider implementation to call.
 * @param input Normalized input payload with canonical changes and stable IDs.
 * @returns Validated editorial output conforming to the schema.
 */
export async function parseOrRetryLLMOutput(
  provider: Provider,
  input: LLMInput,
): Promise<EditorialOutput> {
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
      const parsed = EditorialOutputSchema.safeParse(raw);
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
      isError(lastErr) ? lastErr.message : 'Unknown LLM provider error',
    );
  }
  throw new ValidationError(
    'LLM output did not match editorial schema after retry',
  );
}
