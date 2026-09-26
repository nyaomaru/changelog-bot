import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';

/** Token usage returned by a WHY extraction API call. */
export type WhyExtractionUsage = {
  /** Tokens consumed by the request input. */
  inputTokens: number;
  /** Tokens consumed by the response output. */
  outputTokens: number;
};

/**
 * Minimal contract for the optional WHY-enrichment stage.
 * WHY: Jev can select evidence but cannot generate a complete changelog, so it
 * must remain independent from the full LLM provider contract.
 */
export interface WhyExtractor {
  /** Stable identifier included in diagnostics and missing-key messages. */
  readonly name: string;
  /** Select or generate evidence-backed WHY notes. */
  extractWhyNotes(input: WhyExtractionInput): Promise<WhyExtractionOutput>;
}

/** Optional API usage exposed by extractors that report token accounting. */
export interface UsageReportingWhyExtractor extends WhyExtractor {
  /** Token accounting from the most recent WHY extraction request. */
  lastWhyExtractionUsage?: WhyExtractionUsage;
}
