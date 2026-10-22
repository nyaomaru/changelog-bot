import { WHY_MIN_RENDER_TRUST_SCORE } from '@/constants/why.js';
import type {
  WhyConfidence,
  WhyExtractionItem,
  WhyExtractionOutput,
  WhyNote,
} from '@/types/why.js';

const CONFIDENCE_RANK = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

/** Result of applying local confidence and trust checks to provider notes. */
export type AcceptedWhyNotesResult = {
  /** Provider results that passed identity, confidence, and trust checks. */
  notes: WhyNote[];
  /** Number of provider results rejected by confidence or trust checks. */
  skippedLowTrust: number;
};

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
export function githubWebHost(apiBase: string): string {
  try {
    const apiHost = new URL(apiBase).hostname;
    return apiHost.toLowerCase() === 'api.github.com' ? 'github.com' : apiHost;
  } catch {
    return 'github.com';
  }
}

/**
 * Append accepted WHY notes to the generated pull request description.
 * @param prBody Existing pull request description.
 * @param notes Accepted WHY notes.
 * @param whyLabel User-facing rationale label.
 * @returns Description with a compact WHY preview.
 */
export function appendWhyPreview(
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
 * Apply deterministic confidence and trust checks to provider WHY results.
 * WHY: When a PR has multiple candidate targets (sub-changes), a matching changeId is required.
 * PR-number fallback is only permitted when that PR has exactly one candidate.
 * Matched item's prNumber must strictly equal providerResult.prNumber to prevent identity mismatches.
 * @param providerOutput Validated provider output.
 * @param inputItems Provider inputs keyed by authoritative PR targets.
 * @param minimumConfidence User-configured minimum provider confidence.
 * @returns Accepted notes and the number rejected by trust checks.
 */
export function acceptWhyNotes(
  providerOutput: WhyExtractionOutput,
  inputItems: readonly WhyExtractionItem[],
  minimumConfidence: WhyConfidence,
): AcceptedWhyNotesResult {
  const itemsByChangeId = new Map<string, WhyExtractionItem>();
  const itemsListByPr = new Map<number, WhyExtractionItem[]>();

  for (const item of inputItems) {
    if (item.changeId) {
      itemsByChangeId.set(item.changeId, item);
    }
    const list = itemsListByPr.get(item.prNumber) ?? [];
    list.push(item);
    itemsListByPr.set(item.prNumber, list);
  }

  const notes: WhyNote[] = [];
  let skippedLowTrust = 0;
  const matchedItems = new Set<WhyExtractionItem>();

  for (const providerResult of providerOutput.items) {
    const prCandidates = itemsListByPr.get(providerResult.prNumber);
    if (!prCandidates || prCandidates.length === 0) continue;

    let item: WhyExtractionItem | undefined;

    if (prCandidates.length > 1) {
      // WHY: For PRs with multiple sub-change targets, a matching changeId is required.
      // Positional or PR-number fallback would risk assigning rationale out-of-order or to the wrong sub-change.
      if (!providerResult.changeId) {
        continue;
      }
      const candidate = itemsByChangeId.get(providerResult.changeId);
      // WHY: Verify identity integrity: matched item must belong to the same PR number.
      if (!candidate || candidate.prNumber !== providerResult.prNumber) {
        continue;
      }
      item = candidate;
    } else {
      // Exactly 1 candidate for this PR
      const singleCandidate = prCandidates[0];
      if (providerResult.changeId) {
        // If changeId is provided, it must match the candidate's changeId and PR
        const candidate = itemsByChangeId.get(providerResult.changeId);
        if (!candidate || candidate.prNumber !== providerResult.prNumber) {
          continue;
        }
        item = candidate;
      } else {
        item = singleCandidate;
      }
    }

    if (!item || matchedItems.has(item)) continue;
    matchedItems.add(item);

    const requiredConfidence = item.requiresHighConfidence
      ? 'high'
      : minimumConfidence;
    if (
      CONFIDENCE_RANK[providerResult.confidence] <
        CONFIDENCE_RANK[requiredConfidence] ||
      item.trustScore < WHY_MIN_RENDER_TRUST_SCORE
    ) {
      skippedLowTrust += 1;
      continue;
    }

    const why = normalizeWhyText(providerResult.why);
    if (!why) continue;
    notes.push({
      ...providerResult,
      changeId: item.changeId,
      why,
      sectionTitle: item.sectionTitle,
      trustScore: item.trustScore,
      trustBucket: item.trustBucket,
    });
  }

  return { notes, skippedLowTrust };
}
