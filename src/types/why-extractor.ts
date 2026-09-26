import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';

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
