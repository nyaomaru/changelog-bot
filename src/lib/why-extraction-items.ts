import { GITHUB_METADATA_CONCURRENCY } from '@/constants/github.js';
import { WHY_MAX_TOTAL_PAYLOAD_CHARS } from '@/constants/why.js';
import type { fetchPRDetails } from '@/lib/github.js';
import type { WhyExtractionItem, WhyTarget } from '@/types/why.js';
import { mapConcurrent } from '@/utils/concurrency.js';
import { formatMetadataFallbackReason } from '@/utils/github-error.js';
import { preprocessWhyPrBody } from '@/utils/why-preprocess.js';

type CollectWhyExtractionItemsParams = {
  owner: string;
  repo: string;
  token?: string;
  githubApiBase: string;
  maxCharsPerPr: number;
  fetchPRDetails: typeof fetchPRDetails;
  concurrency?: number;
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
 * @param params GitHub lookup dependencies, candidate limits, and optional concurrency setting.
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

  // WHY: Deduplicate target PR numbers before fetching so we make at most one
  // network request per unique PR, bounded by GITHUB_METADATA_CONCURRENCY.
  const uniquePrNumbers = Array.from(
    new Set(targets.map((target) => target.prNumber)),
  );

  const lookups = await mapConcurrent(
    uniquePrNumbers,
    params.concurrency ?? GITHUB_METADATA_CONCURRENCY,
    async (prNumber) => {
      const lookup = await params.fetchPRDetails(
        params.owner,
        params.repo,
        prNumber,
        params.token,
        params.githubApiBase,
      );
      return [prNumber, lookup] as const;
    },
  );

  const lookupByPrNumber = new Map(lookups);
  for (const [, lookup] of lookups) {
    if (lookup.status === 'success') {
      result.prBodiesFetched += 1;
    }
  }

  for (const target of targets) {
    const lookup = lookupByPrNumber.get(target.prNumber);
    if (!lookup || lookup.status !== 'success') {
      const fallbackReason = lookup
        ? formatMetadataFallbackReason(target.prNumber, lookup)
        : `Skipped PR #${target.prNumber}: PR details unavailable`;
      result.fallbackReasons.push(fallbackReason);
      continue;
    }

    const preprocessed = preprocessWhyPrBody(target, lookup.data, {
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
