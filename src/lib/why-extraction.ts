import { LlmError } from '@/lib/errors.js';
import type { fetchPRDetails } from '@/lib/github.js';
import type { CliOptions } from '@/schema/cli.js';
import {
  WHY_MAX_TOTAL_PAYLOAD_CHARS,
  WHY_MIN_RENDER_TRUST_SCORE,
} from '@/constants/why.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import type {
  WhyConfidence,
  WhyDiagnostics,
  WhyExtractionItem,
  WhyExtractionOutput,
  WhyNote,
  WhyTarget,
} from '@/types/why.js';
import { preprocessWhyPrBody } from '@/utils/why-preprocess.js';
import {
  applyWhyNotesToSection,
  extractWhyTargets,
} from '@/utils/why-targets.js';
import { removeFallbackNote } from '@/utils/llm-output-common.js';

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

type WhyItemCollectionResult = {
  /** Trusted provider-ready items collected from GitHub. */
  items: WhyExtractionItem[];
  /** Number of PR descriptions fetched successfully. */
  prBodiesFetched: number;
  /** Number of fetched descriptions rejected by local trust checks. */
  skippedLowTrust: number;
  /** Per-PR reasons explaining unavailable or rejected descriptions. */
  fallbackReasons: string[];
};

type AcceptedWhyNotesResult = {
  /** Provider results that passed local identity, confidence, and trust checks. */
  notes: WhyNote[];
  /** Number of provider results rejected by confidence or trust checks. */
  skippedLowTrust: number;
};

const CONFIDENCE_RANK = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

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

function truncatePayloadItems(items: WhyExtractionItem[]): WhyExtractionItem[] {
  const boundedItems: WhyExtractionItem[] = [];
  let usedChars = 0;

  for (const item of items) {
    const itemChars = item.candidates.join('\n').length;
    if (usedChars + itemChars > WHY_MAX_TOTAL_PAYLOAD_CHARS) break;
    boundedItems.push(item);
    usedChars += itemChars;
  }

  return boundedItems;
}

function normalizeWhyText(why: string): string {
  return why
    .replace(/\s+/g, ' ')
    .replace(/^[-*]\s+/, '')
    .trim()
    .slice(0, 180);
}

/**
 * Resolve the pull-link hostname corresponding to a GitHub API base URL.
 * @param apiBase GitHub.com or GHES API base URL.
 * @returns Hostname used by repository pull request links.
 */
function githubWebHost(apiBase: string): string {
  try {
    const apiHost = new URL(apiBase).hostname;
    return apiHost.toLowerCase() === 'api.github.com' ? 'github.com' : apiHost;
  } catch {
    return 'github.com';
  }
}

function appendWhyPreview(
  prBody: string,
  notes: readonly WhyNote[],
  whyLabel: string,
): string {
  if (!notes.length) return prBody;
  const preview = notes
    .map((note) => `- #${note.prNumber}: ${whyLabel}: ${note.why}`)
    .join('\n');
  return `${prBody.trim()}\n\n### WHY preview\n\n${preview}`.trim();
}

/**
 * Fetch and preprocess PR descriptions selected from changelog bullets.
 * @param params WHY extraction dependencies.
 * @param targets Authoritative PR targets selected from the changelog.
 * @param token GitHub token required for PR detail requests.
 * @returns Trusted provider inputs and collection diagnostics.
 */
async function collectWhyExtractionItems(
  params: RunWhyExtractionParams,
  targets: readonly WhyTarget[],
  token?: string,
): Promise<WhyItemCollectionResult> {
  const result: WhyItemCollectionResult = {
    items: [],
    prBodiesFetched: 0,
    skippedLowTrust: 0,
    fallbackReasons: [],
  };

  for (const target of targets) {
    const details = await params.fetchPRDetails(
      params.owner,
      params.repo,
      target.prNumber,
      token,
      params.githubApiBase,
    );
    if (!details) {
      result.fallbackReasons.push(
        `Skipped PR #${target.prNumber}: PR details unavailable`,
      );
      continue;
    }
    result.prBodiesFetched += 1;
    const preprocessed = preprocessWhyPrBody(target, details, {
      maxCharsPerPr: params.cli.whyMaxCharsPerPr,
    });
    if (preprocessed.item) {
      result.items.push(preprocessed.item);
      continue;
    }
    if (preprocessed.lowTrust) result.skippedLowTrust += 1;
    if (preprocessed.skippedReason) {
      result.fallbackReasons.push(preprocessed.skippedReason);
    }
  }

  return result;
}

/**
 * Apply deterministic confidence and trust checks to provider WHY results.
 * @param providerOutput Validated provider output.
 * @param inputItems Provider inputs keyed by their authoritative PR targets.
 * @param minimumConfidence User-configured minimum provider confidence.
 * @returns Accepted notes and the number rejected by trust checks.
 */
function acceptWhyNotes(
  providerOutput: WhyExtractionOutput,
  inputItems: readonly WhyExtractionItem[],
  minimumConfidence: WhyConfidence,
): AcceptedWhyNotesResult {
  const itemsByPr = new Map(
    inputItems.map((item) => [item.prNumber, item] as const),
  );
  const notes: WhyNote[] = [];
  let skippedLowTrust = 0;

  for (const providerResult of providerOutput.items) {
    const item = itemsByPr.get(providerResult.prNumber);
    if (!item) continue;
    const confidenceRank = CONFIDENCE_RANK[providerResult.confidence];
    const requiredConfidence = item.requiresHighConfidence
      ? 'high'
      : minimumConfidence;
    if (
      confidenceRank < CONFIDENCE_RANK[requiredConfidence] ||
      item.trustScore < WHY_MIN_RENDER_TRUST_SCORE
    ) {
      skippedLowTrust += 1;
      continue;
    }
    const why = normalizeWhyText(providerResult.why);
    if (!why) continue;
    notes.push({
      ...providerResult,
      why,
      sectionTitle: item.sectionTitle,
      trustScore: item.trustScore,
      trustBucket: item.trustBucket,
    });
  }

  return { notes, skippedLowTrust };
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
    params,
    targets,
    params.token,
  );
  diagnostics.prBodiesFetched = collection.prBodiesFetched;
  diagnostics.skippedLowTrust += collection.skippedLowTrust;
  diagnostics.fallbackReasons.push(...collection.fallbackReasons);

  const boundedItems = truncatePayloadItems(collection.items);
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
    const message = error instanceof Error ? error.message : String(error);
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
