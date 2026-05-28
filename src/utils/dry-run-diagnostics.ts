import type { ProviderName } from '@/types/llm.js';

/** Inputs required to render dry-run execution diagnostics. */
export type DryRunDiagnosticsInput = {
  /** Provider selected for the run. */
  providerName: ProviderName;
  /** Model configured for the selected provider. */
  modelName: string;
  /** Whether any provider request completed successfully. */
  aiUsed: boolean;
  /** Reasons explaining fallback behavior when provider usage was skipped or failed. */
  fallbackReasons: string[];
};

/**
 * Format provider diagnostics for dry-run output.
 * @param input Provider, model, and fallback state for the current run.
 * @returns Human-readable diagnostic block.
 */
export function formatDryRunDiagnostics(input: DryRunDiagnosticsInput): string {
  const fallbackReasonText = input.fallbackReasons.length
    ? input.fallbackReasons.join('; ')
    : 'none';

  return [
    `Provider: ${input.providerName}`,
    `Model: ${input.modelName}`,
    `AI used: ${input.aiUsed ? 'true' : 'false'}`,
    `Fallback reasons: ${fallbackReasonText}`,
  ].join('\n');
}
