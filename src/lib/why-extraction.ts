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
  WhyDiagnostics,
  WhyExtractionItem,
  WhyNote,
} from '@/types/why.js';
import { preprocessWhyPrBody } from '@/utils/why-preprocess.js';
import {
  applyWhyNotesToSection,
  extractWhyTargets,
} from '@/utils/why-targets.js';

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
  if (!params.token) {
    diagnostics.fallbackReasons.push(
      'WHY extraction skipped: missing GitHub token for PR body fetches',
    );
    return { llm, diagnostics };
  }
  if (cli.whyMaxPrs === 0) {
    diagnostics.fallbackReasons.push('WHY extraction skipped: whyMaxPrs is 0');
    return { llm, diagnostics };
  }

  const extractedTargets = extractWhyTargets(llm.new_section_markdown);
  diagnostics.targetsFound = extractedTargets.targets.length;
  diagnostics.skippedBeforeFetch = extractedTargets.skippedBeforeFetch;
  const targets = extractedTargets.targets.slice(0, cli.whyMaxPrs);
  if (!targets.length) {
    diagnostics.fallbackReasons.push(
      'WHY extraction skipped: no eligible changelog PRs',
    );
    return { llm, diagnostics };
  }

  const items: WhyExtractionItem[] = [];
  for (const target of targets) {
    const details = await params.fetchPRDetails(
      params.owner,
      params.repo,
      target.prNumber,
      params.token,
      params.githubApiBase,
    );
    if (!details) {
      diagnostics.fallbackReasons.push(
        `Skipped PR #${target.prNumber}: PR details unavailable`,
      );
      continue;
    }
    diagnostics.prBodiesFetched += 1;
    const preprocessed = preprocessWhyPrBody(target, details, {
      maxCharsPerPr: cli.whyMaxCharsPerPr,
    });
    if (preprocessed.item) {
      items.push(preprocessed.item);
      continue;
    }
    if (preprocessed.lowTrust) diagnostics.skippedLowTrust += 1;
    if (preprocessed.skippedReason) {
      diagnostics.fallbackReasons.push(preprocessed.skippedReason);
    }
  }

  const boundedItems = truncatePayloadItems(items);
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

  const itemsByPr = new Map(
    boundedItems.map((item) => [item.prNumber, item] as const),
  );
  const acceptedNotes: WhyNote[] = [];
  for (const result of providerOutput.items) {
    const item = itemsByPr.get(result.prNumber);
    if (!item) continue;
    const confidenceRank = CONFIDENCE_RANK[result.confidence];
    const requiredConfidence = item.requiresHighConfidence
      ? 'high'
      : cli.whyConfidence;
    if (confidenceRank < CONFIDENCE_RANK[requiredConfidence]) {
      diagnostics.skippedLowTrust += 1;
      continue;
    }
    if (item.trustScore < WHY_MIN_RENDER_TRUST_SCORE) {
      diagnostics.skippedLowTrust += 1;
      continue;
    }
    const why = normalizeWhyText(result.why);
    if (!why) continue;
    acceptedNotes.push({
      ...result,
      why,
      sectionTitle: item.sectionTitle,
      trustScore: item.trustScore,
      trustBucket: item.trustBucket,
    });
  }

  if (!acceptedNotes.length) {
    diagnostics.fallbackReasons.push(
      'WHY extraction skipped: provider returned no trusted notes',
    );
    return { llm, diagnostics };
  }

  const notesByPr = new Map(
    acceptedNotes.map((note) => [note.prNumber, note] as const),
  );
  diagnostics.notesRendered = acceptedNotes.length;
  return {
    llm: {
      ...llm,
      new_section_markdown: applyWhyNotesToSection(
        llm.new_section_markdown,
        notesByPr,
        cli.whyLabel,
      ),
      pr_body: appendWhyPreview(llm.pr_body, acceptedNotes, cli.whyLabel),
    },
    diagnostics,
  };
}
