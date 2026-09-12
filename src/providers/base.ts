import { LLM_GENERATE_MAX_TOKENS } from '@/constants/prompt.js';
import type { ProviderRuntimeConfig } from '@/types/config.js';
import type {
  ClassificationChange,
  ClassificationResult,
} from '@/types/changelog.js';
import type { LLMInput, LLMOutput } from '@/types/llm.js';
import type { ClassifyChangesOptions, Provider } from '@/types/provider.js';
import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';

/** Options that vary the shared capabilities advertised by a provider. */
type ProviderBaseOptions = {
  /** Whether the configured model supports reasoning controls. */
  reasoning?: boolean;
};

/**
 * Share immutable runtime configuration across concrete provider adapters.
 * WHY: Provider APIs use different request formats, but their configuration
 * and baseline capability contract must stay consistent as providers evolve.
 */
export abstract class ProviderBase implements Provider {
  abstract name: Provider['name'];

  readonly modelName: string;
  readonly supports: Provider['supports'];

  protected readonly apiKey?: string;

  /**
   * Initialize the common provider runtime settings.
   * @param config API credentials and the selected model.
   * @param options Provider capability differences for the selected model.
   */
  protected constructor(
    config: ProviderRuntimeConfig,
    { reasoning = false }: ProviderBaseOptions = {},
  ) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.supports = {
      jsonMode: true,
      streaming: false,
      reasoning,
      maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
    };
  }

  /**
   * Generate release-note content from structured changelog input.
   * @param input Release data and prompt context.
   * @returns Generated release-note and pull-request metadata.
   */
  abstract generate(input: LLMInput): Promise<LLMOutput>;

  /**
   * Classify normalized release changes into changelog categories.
   * @param changes Stable change IDs and titles to classify.
   * @param options Error-handling behavior for invalid provider output.
   * @returns Category assignments and any recovery diagnostics.
   */
  abstract classifyChanges(
    changes: ClassificationChange[],
    options?: ClassifyChangesOptions,
  ): Promise<ClassificationResult>;

  /**
   * Extract evidence-backed WHY notes from pull-request details.
   * @param input Candidate PR evidence and language settings.
   * @returns Validated WHY notes.
   */
  abstract extractWhyNotes(
    input: WhyExtractionInput,
  ): Promise<WhyExtractionOutput>;
}
