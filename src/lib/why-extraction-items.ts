import { WHY_MAX_TOTAL_PAYLOAD_CHARS } from '@/constants/why.js';
import type { fetchPRDetails } from '@/lib/github.js';
import type { WhyExtractionItem, WhyTarget } from '@/types/why.js';
import { preprocessWhyPrBody } from '@/utils/why-preprocess.js';

type CollectWhyExtractionItemsParams = {
  owner: string;
  repo: string;
  token?: string;
  githubApiBase: string;
  maxCharsPerPr: number;
  fetchPRDetails: typeof fetchPRDetails;
};

/** Result of fetching and locally validating WHY extraction candidates. */
export type WhyItemCollectionResult = {
  /** Trusted provider-ready items collected from pull request descriptions. */
  items: WhyExtractionItem[];
  /** Number of pull request descriptions fetched successfully. */
  prBodiesFetched: number;
  /** Number of fetched descriptions rejected by local trust checks. */
  skippedLowTrust: number;
  /** Per-PR reasons explaining unavailable or rejected descriptions. */
  fallbackReasons: string[];
};

/**
 * Fetch and preprocess PR descriptions selected from changelog bullets.
 * @param params GitHub lookup dependencies and per-PR candidate limit.
 * @param targets Authoritative PR targets selected from the changelog.
 * @returns Trusted provider inputs and collection diagnostics.
 */
export async function collectWhyExtractionItems(
  params: CollectWhyExtractionItemsParams,
  targets: readonly WhyTarget[],
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
      params.token,
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
      maxCharsPerPr: params.maxCharsPerPr,
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
 * Bound provider inputs by the configured total payload limit.
 * @param items Trusted per-PR WHY candidates.
 * @returns Leading items that fit within the total character budget.
 */
export function truncateWhyPayloadItems(
  items: readonly WhyExtractionItem[],
): WhyExtractionItem[] {
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
