import type { LLMInput } from '@/types/llm.js';
import { CHANGELOG_PREVIEW_LIMIT } from '@/constants/prompt.js';

/** Inputs required to build the provider-facing LLM prompt. */
type BuildLLMInput = Omit<LLMInput, 'changelogPreview'> & {
  /** Full changelog contents prior to truncation. */
  changelog: string;
};

/**
 * Build the LLM input payload with a truncated changelog preview.
 * WHY: Limit the changelog to `CHANGELOG_PREVIEW_LIMIT` to keep prompts small
 * and predictable for token budgets while still providing recent context.
 * @param input Fields required to construct an LLMInput plus full changelog text.
 * @returns LLMInput with `changelogPreview` capped to the configured limit.
 */
export function buildLLMInput(input: BuildLLMInput): LLMInput {
  const changelogPreview = (input.changelog ?? '').slice(
    0,
    CHANGELOG_PREVIEW_LIMIT,
  );
  return {
    repo: input.repo,
    version: input.version,
    date: input.date,
    releaseTag: input.releaseTag,
    prevTag: input.prevTag,
    releaseBody: input.releaseBody,
    gitLog: input.gitLog,
    mergedPRs: input.mergedPRs,
    changelogPreview,
    language: input.language,
  };
}
