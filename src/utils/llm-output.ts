import { buildOutputFromReleaseNotes } from '@/utils/llm-output-release-notes.js';
import { buildOutputFromModelOrFallback } from '@/utils/llm-output-model.js';
import { LlmError } from '@/lib/errors.js';
import type {
  BuildChangelogLlmOutputParams,
  BuildLlmOutputResult,
} from '@/types/changelog-output.js';

/**
 * Build the LLM output payload used for changelog updates and PR creation.
 * WHY: Centralizes the release-notes, model, and fallback paths so the CLI flow stays readable.
 * @param params Inputs needed to construct or infer the changelog section.
 * @returns Output payload plus metadata about LLM usage.
 */
export async function buildChangelogLlmOutput(
  params: BuildChangelogLlmOutputParams,
): Promise<BuildLlmOutputResult> {
  const fallbackReasons: string[] = [];
  if (params.noAi) {
    fallbackReasons.push('AI disabled by --no-ai');
  }
  if (params.requireProvider && !params.hasProviderKey) {
    throw new LlmError(
      `Provider required but API key is missing for provider: ${params.provider.name}`,
    );
  }

  const hasCustomization = Boolean(
    params.customInstructions || params.language !== 'en',
  );

  if (params.noAi || !hasCustomization || !params.hasProviderKey) {
    const fromRelease = await buildOutputFromReleaseNotes(
      params,
      fallbackReasons,
    );
    if (fromRelease) return fromRelease;
  }

  return buildOutputFromModelOrFallback(params, fallbackReasons);
}
