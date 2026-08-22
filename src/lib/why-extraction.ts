import { LlmError } from '@/lib/errors.js';
import type { fetchPRDetails } from '@/lib/github.js';
import type { CliOptions } from '@/schema/cli.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import type { WhyDiagnostics } from '@/types/why.js';
import {
  applyWhyNotesToSection,
  extractWhyTargets,
} from '@/utils/why-targets.js';
import { removeFallbackNote } from '@/utils/llm-output-common.js';
import {
  collectWhyExtractionItems,
  truncateWhyPayloadItems,
} from '@/lib/why-extraction-items.js';
import {
  acceptWhyNotes,
  appendWhyPreview,
  githubWebHost,
} from '@/lib/why-extraction-notes.js';
import { isError } from '@/utils/is.js';

type RunWhyExtractionParams = {
  /** Parsed CLI options controlling WHY extraction. */
  cli: CliOptions;
  /** Generated changelog output before WHY notes are applied. */
  llm: LLMOutput;
  /** Selected provider implementation. */
  provider: Provider;
  /** Whether the selected provider has an API key. */
  hasProviderKey: boolean;
  /** Repository owner or org. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** GitHub token used for PR body fetches. */
  token?: string;
  /** GitHub API base URL. */
  githubApiBase: string;
  /** Function used to fetch PR details. */
  fetchPRDetails: typeof fetchPRDetails;
};

type RunWhyExtractionResult = {
  /** Updated LLM output with WHY notes applied when available. */
  llm: LLMOutput;
  /** Dry-run diagnostics for WHY extraction. */
  diagnostics: WhyDiagnostics;
};

function createEmptyDiagnostics(enabled: boolean): WhyDiagnostics {
  return {
    enabled,
    aiUsed: false,
    targetsFound: 0,
    prBodiesFetched: 0,
    skippedBeforeFetch: 0,
    skippedLowTrust: 0,
    notesRendered: 0,
    fallbackReasons: [],
  };
}

/**
 * Extract and render WHY notes after the changelog section is generated.
 * @param params WHY extraction dependencies and generated output.
 * @returns Updated output and diagnostics.
 */
export async function runWhyExtraction(
  params: RunWhyExtractionParams,
): Promise<RunWhyExtractionResult> {
  const { cli, llm } = params;
  const diagnostics = createEmptyDiagnostics(cli.why);
  if (!cli.why) return { llm, diagnostics };

  if (cli.noAi) {
    diagnostics.fallbackReasons.push('WHY extraction skipped: --no-ai is set');
    return { llm, diagnostics };
  }
  if (!params.hasProviderKey) {
    diagnostics.fallbackReasons.push(
      `WHY extraction skipped: missing API key for ${params.provider.name}`,
    );
    return { llm, diagnostics };
  }
  if (cli.whyMaxPrs === 0) {
    diagnostics.fallbackReasons.push('WHY extraction skipped: whyMaxPrs is 0');
    return { llm, diagnostics };
  }

  const repository = {
    owner: params.owner,
    repo: params.repo,
    host: githubWebHost(params.githubApiBase),
  };
  const extractedTargets = extractWhyTargets(
    llm.new_section_markdown,
    repository,
  );
  diagnostics.targetsFound = extractedTargets.targets.length;
  diagnostics.skippedBeforeFetch = extractedTargets.skippedBeforeFetch;
  const targets = extractedTargets.targets.slice(0, cli.whyMaxPrs);
  if (!targets.length) {
    diagnostics.fallbackReasons.push(
      'WHY extraction skipped: no eligible changelog PRs',
    );
    return { llm, diagnostics };
  }

  const collection = await collectWhyExtractionItems(
    {
      owner: params.owner,
      repo: params.repo,
      token: params.token,
      githubApiBase: params.githubApiBase,
      maxCharsPerPr: cli.whyMaxCharsPerPr,
      fetchPRDetails: params.fetchPRDetails,
    },
    targets,
  );
  diagnostics.prBodiesFetched = collection.prBodiesFetched;
  diagnostics.skippedLowTrust += collection.skippedLowTrust;
  diagnostics.fallbackReasons.push(...collection.fallbackReasons);

  const boundedItems = truncateWhyPayloadItems(collection.items);
  if (!boundedItems.length) {
    diagnostics.fallbackReasons.push(
      'WHY extraction skipped: no trusted PR description candidates',
    );
    return { llm, diagnostics };
  }

  let providerOutput;
  try {
    providerOutput = await params.provider.extractWhyNotes({
      language: cli.language,
      whyLabel: cli.whyLabel,
      items: boundedItems,
    });
    diagnostics.aiUsed = true;
  } catch (error) {
    const message = isError(error) ? error.message : String(error);
    if (cli.failOnLlmError) {
      throw new LlmError(`WHY extraction failed: ${message}`);
    }
    diagnostics.fallbackReasons.push(`WHY extraction skipped: ${message}`);
    return { llm, diagnostics };
  }

  // WHY: A successful WHY request means the final output did use an LLM,
  // even when confidence filtering later rejects every returned note.
  const prBodyAfterAiUse = removeFallbackNote(llm.pr_body);
  const llmAfterAiUse: LLMOutput =
    prBodyAfterAiUse === llm.pr_body
      ? llm
      : { ...llm, pr_body: prBodyAfterAiUse };

  const accepted = acceptWhyNotes(
    providerOutput,
    boundedItems,
    cli.whyConfidence,
  );
  diagnostics.skippedLowTrust += accepted.skippedLowTrust;
  const acceptedNotes = accepted.notes;

  if (!acceptedNotes.length) {
    diagnostics.fallbackReasons.push(
      'WHY extraction skipped: provider returned no trusted notes',
    );
    return { llm: llmAfterAiUse, diagnostics };
  }

  const notesByPr = new Map(
    acceptedNotes.map((note) => [note.prNumber, note] as const),
  );
  diagnostics.notesRendered = acceptedNotes.length;
  return {
    llm: {
      ...llmAfterAiUse,
      new_section_markdown: applyWhyNotesToSection(
        llmAfterAiUse.new_section_markdown,
        notesByPr,
        cli.whyLabel,
        repository,
      ),
      pr_body: appendWhyPreview(
        llmAfterAiUse.pr_body,
        acceptedNotes,
        cli.whyLabel,
      ),
    },
    diagnostics,
  };
}
