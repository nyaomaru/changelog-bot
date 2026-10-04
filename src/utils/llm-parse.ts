import type { Provider } from '@/types/provider.js';
import type { LLMInput, LLMOutput } from '@/types/llm.js';
import { LLMOutputSchema } from '@/schema/schema.js';
import { EditorialOutputSchema } from '@/schema/editorial.js';
import { LlmError, ValidationError } from '@/lib/errors.js';
import { LLM_TRUNCATE_LIMIT } from '@/constants/prompt.js';
import { isError, isRecord } from '@/utils/is.js';

/**
 * Generate LLM output and enforce schema with a bounded retry using a repaired prompt.
 * WHY: Providers sometimes overrun budgets; retry with truncated inputs improves success odds.
 * In Phase 4, accepts both sparse editorial output and legacy LLMOutput.
 * @param provider Provider implementation to call.
 * @param input Normalized input payload.
 * @returns Validated LLM or editorial output conforming to the schema.
 */
export async function parseOrRetryLLMOutput(
  provider: Provider,
  input: LLMInput,
): Promise<LLMOutput | unknown> {
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
      if (isRecord(raw) && 'changes' in raw) {
        const parsedEditorial = EditorialOutputSchema.safeParse(raw);
        if (parsedEditorial.success) return parsedEditorial.data;
      }
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
      isError(lastErr) ? lastErr.message : 'Unknown LLM provider error',
    );
  }
  throw new ValidationError('LLM output did not match schema after retry');
}
