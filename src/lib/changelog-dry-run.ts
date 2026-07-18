import type { CliOptions } from '@/schema/cli.js';
import type { ProviderName } from '@/types/llm.js';
import type { WhyDiagnostics } from '@/types/why.js';
import type { CustomInstructionsResolution } from '@/lib/customization.js';
import {
  formatDryRunDiagnostics,
  formatDryRunJsonReport,
} from '@/utils/dry-run-diagnostics.js';

/** Logger used for user-visible changelog workflow output. */
export type ChangelogRunLogger = (message: string) => void;

type PromptCustomizationReasonInput = {
  requested: boolean;
  resolved: boolean;
  noAi: boolean;
  hasProviderKey: boolean;
  aiUsed: boolean;
};

function getPromptCustomizationReason(
  input: PromptCustomizationReasonInput,
): string {
  if (!input.requested) return 'not requested';
  if (!input.resolved) return 'no usable instructions after normalization';
  if (input.noAi)
    return 'not applied because --no-ai skips provider generation';
  if (!input.hasProviderKey) {
    return 'not applied because provider API key is missing';
  }
  if (!input.aiUsed) {
    return 'not applied because provider generation did not complete';
  }
  return 'applied to provider full generation';
}

/** Inputs required to print a completed dry-run. */
export type WriteDryRunOutputParams = {
  /** Parsed CLI options. */
  cli: CliOptions;
  /** Logger used for user-visible output. */
  log: ChangelogRunLogger;
  /** Selected provider name. */
  providerName: ProviderName;
  /** Selected model name. */
  modelName: string;
  /** Whether changelog generation used a provider successfully. */
  changelogAiUsed: boolean;
  /** Changelog-generation fallback reasons. */
  fallbackReasons: string[];
  /** Resolved prompt customization and diagnostics. */
  customInstructionsResolution: CustomInstructionsResolution;
  /** Usable prompt customization text, if any. */
  customInstructions?: string;
  /** Whether the selected provider has a configured API key. */
  hasProviderKey: boolean;
  /** WHY extraction diagnostics. */
  whyDiagnostics: WhyDiagnostics;
  /** Changelog content produced by the run. */
  updated: string;
};

/**
 * Print dry-run diagnostics followed by the generated changelog.
 * @param params Generation state, diagnostics, output, and logger.
 * @returns Nothing.
 */
export function writeDryRunOutput(params: WriteDryRunOutputParams): void {
  const {
    cli,
    log,
    providerName,
    modelName,
    changelogAiUsed,
    fallbackReasons,
    customInstructionsResolution,
    customInstructions,
    hasProviderKey,
    whyDiagnostics,
    updated,
  } = params;

  log('==== DRY RUN (no PR) ====');
  const diagnosticsInput = {
    providerName,
    modelName,
    aiUsed: changelogAiUsed || whyDiagnostics.aiUsed,
    fallbackReasons,
    promptCustomization: {
      ...customInstructionsResolution.diagnostics,
      applied: Boolean(customInstructions && changelogAiUsed && !cli.noAi),
      reason: getPromptCustomizationReason({
        requested: customInstructionsResolution.diagnostics.requested,
        resolved: customInstructionsResolution.diagnostics.resolved,
        noAi: cli.noAi,
        hasProviderKey,
        aiUsed: changelogAiUsed,
      }),
    },
    why: whyDiagnostics,
  };
  log(
    cli.dryRunJsonReport
      ? formatDryRunJsonReport(diagnosticsInput)
      : formatDryRunDiagnostics(diagnosticsInput),
  );
  log('');
  log(updated);
}
