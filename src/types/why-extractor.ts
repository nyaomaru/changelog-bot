import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';

/** Token usage returned by a WHY extraction API call. */
export type WhyExtractionUsage = {
  /** Tokens consumed by the request input. */
  inputTokens: number;
  /** Tokens consumed by the response output. */
  outputTokens: number;
};

/** Throttle and retry diagnostics observed during an extraction request. */
export type WhyExtractionDiagnostics = {
  /** Number of retry attempts made due to rate-limiting or transient errors. */
  retries: number;
  /** Whether at least one rate-limit or capacity throttle was encountered. */
  throttled: boolean;
};

/**
 * Minimal contract for the optional WHY-enrichment stage.
 * WHY: Jev can select evidence but cannot generate a complete changelog, so it
 * must remain independent from the full LLM provider contract.
 */
export interface WhyExtractor {
  /** Stable identifier included in diagnostics and missing-key messages. */
  readonly name: string;
  /** Token accounting from the most recent WHY extraction request, when available. */
  readonly lastWhyExtractionUsage?: WhyExtractionUsage;
  /** Model actually served by the provider API, when available. */
  readonly lastServedModel?: string;
  /** Request diagnostics including retry and throttle events, when observable. */
  readonly lastWhyExtractionDiagnostics?: WhyExtractionDiagnostics;
  /** Select or generate evidence-backed WHY notes. */
  extractWhyNotes(input: WhyExtractionInput): Promise<WhyExtractionOutput>;
}
