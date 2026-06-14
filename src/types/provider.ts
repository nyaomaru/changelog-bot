import type { LLMInput, LLMOutput, ProviderName } from '@/types/llm.js';
import type { CategoryMap } from '@/types/changelog.js';
import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';

/** Capability flags for a provider implementation. */
export type ProviderCapabilities = {
  /** Supports strict JSON/function-call output modes. */
  jsonMode: boolean;
  /** Supports token-by-token streaming APIs. */
  streaming: boolean;
  /** Supports reasoning/CoT knobs. */
  reasoning: boolean;
  /** Max output tokens the provider enforces (advisory). */
  maxOutputTokens: number;
};

/** Light-weight provider info exposed to callers. */
export type ProviderInfo = {
  /** Provider ID used in flags/env. */
  name: ProviderName;
  /** Concrete model identifier. */
  modelName: string;
  /** Capability flags. */
  supports: ProviderCapabilities;
};

/** Options controlling provider title classification error handling. */
export type ClassifyTitlesOptions = {
  /** Throw provider/parse errors instead of returning deterministic fallback categories. */
  throwOnError?: boolean;
};

/**
 * Contract implemented by LLM provider adapters.
 * Implementations should normalize outputs at this boundary.
 */
export interface Provider extends ProviderInfo {
  /** Generate structured output from normalized input. */
  generate(input: LLMInput): Promise<LLMOutput>;
  /** Classify titles into changelog categories. */
  classifyTitles(
    titles: string[],
    options?: ClassifyTitlesOptions,
  ): Promise<CategoryMap>;
  /** Extract concise WHY notes from preprocessed PR description candidates. */
  extractWhyNotes(input: WhyExtractionInput): Promise<WhyExtractionOutput>;
}
