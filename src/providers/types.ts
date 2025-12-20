import type { LLMInput, LLMOutput } from '@/types/llm.js';

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
  name: 'openai' | 'anthropic';
  /** Concrete model identifier. */
  modelName: string;
  /** Capability flags. */
  supports: ProviderCapabilities;
};

/**
 * Contract implemented by LLM provider adapters.
 * Implementations should normalize outputs at this boundary.
 */
export interface Provider extends ProviderInfo {
  /** Generate structured output from normalized input. */
  generate(input: LLMInput): Promise<LLMOutput>;
}

