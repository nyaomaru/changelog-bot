import type { CliOptions } from '@/schema/cli.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import type { WhyDiagnostics } from '@/types/why.js';
import type { ChangelogRunDependencies } from '@/lib/changelog-run-dependencies.js';

type ChangelogRunOutputDependencies = Pick<
  ChangelogRunDependencies,
  'fetchPRDetails' | 'finalizeChangelogUpdate' | 'runWhyExtraction'
>;

/** Parameters used to finalize and optionally enrich generated output. */
export type FinalizeChangelogRunOutputParams = {
  /** Validated CLI options controlling WHY extraction. */
  cli: CliOptions;
  /** Initial generated changelog and pull request payload. */
  llm: LLMOutput;
  /** Selected provider adapter. */
  provider: Provider;
  /** Whether the selected provider has an API key. */
  hasProviderKey: boolean;
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Previous release ref or first commit. */
  prevRef: string;
  /** Current release ref or tag. */
  releaseRef: string;
  /** Release version without the leading `v`. */
  version: string;
  /** Existing changelog content before the update. */
  existingChangelog: string;
  /** Pull request numbers keyed by normalized title. */
  titleToPr: Record<string, number>;
  /** GitHub token, when authentication is available. */
  token?: string;
  /** GitHub or GHES API base URL. */
  githubApiBase: string;
  /** Output finalization and WHY extraction adapters. */
  deps: ChangelogRunOutputDependencies;
};

/** Final changelog artifacts and enrichment diagnostics. */
export type FinalizeChangelogRunOutputResult = {
  /** Sanitized LLM output after optional WHY enrichment. */
  llm: LLMOutput;
  /** Updated full changelog content. */
  updatedChangelog: string;
  /** Diagnostics from optional WHY extraction. */
  whyDiagnostics: WhyDiagnostics;
};

/**
 * Finalize generated output and re-finalize only when WHY enrichment changes it.
 * WHY: WHY notes alter section markdown after normal post-processing. Running
 * finalization again preserves compare links and PR references without doing
 * duplicate work when enrichment is disabled or produces no change.
 * @param params Generated output, release context, and workflow adapters.
 * @returns Final LLM payload, full changelog content, and WHY diagnostics.
 */
export async function finalizeChangelogRunOutput(
  params: FinalizeChangelogRunOutputParams,
): Promise<FinalizeChangelogRunOutputResult> {
  const finalize = (llm: LLMOutput) =>
    params.deps.finalizeChangelogUpdate({
      owner: params.owner,
      repo: params.repo,
      version: params.version,
      prevRef: params.prevRef,
      releaseRef: params.releaseRef,
      existing: params.existingChangelog,
      llm,
      titleToPr: params.titleToPr,
    });

  let finalized = finalize(params.llm);
  const whyOutput = await params.deps.runWhyExtraction({
    cli: params.cli,
    llm: finalized.llm,
    provider: params.provider,
    hasProviderKey: params.hasProviderKey,
    owner: params.owner,
    repo: params.repo,
    token: params.token,
    githubApiBase: params.githubApiBase,
    fetchPRDetails: params.deps.fetchPRDetails,
  });

  if (whyOutput.llm !== finalized.llm) {
    finalized = finalize(whyOutput.llm);
  }

  return {
    llm: finalized.llm,
    updatedChangelog: finalized.updated,
    whyDiagnostics: whyOutput.diagnostics,
  };
}
