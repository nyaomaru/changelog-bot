import type {
  MetadataDiagnostics,
  MetadataLookupFailureReason,
  MetadataLookupResult,
} from '@/types/github.js';

const METADATA_LOOKUP_FAILURE_REASONS: readonly MetadataLookupFailureReason[] =
  [
    'not-found',
    'unauthenticated',
    'rate-limited',
    'invalid-response',
    'network-error',
  ];

/**
 * Create an empty metadata diagnostics accumulator with zeroed counters.
 * @returns Initialized metadata diagnostics object.
 */
export function createMetadataDiagnostics(): MetadataDiagnostics {
  return {
    totalLookups: 0,
    successfulLookups: 0,
    degradedLookups: 0,
    failureCounts: {
      'not-found': 0,
      unauthenticated: 0,
      'rate-limited': 0,
      'invalid-response': 0,
      'network-error': 0,
    },
    fallbackReasons: [],
  };
}

/**
 * Record a single typed metadata lookup outcome into the diagnostics accumulator.
 * @param targetDiagnostics Target diagnostics object to update.
 * @param lookupResult Typed outcome of the metadata lookup.
 * @param fallbackReason Optional human-readable reason string or formatting callback when degraded.
 */
export function recordMetadataLookupOutcome<ResultType>(
  targetDiagnostics: MetadataDiagnostics,
  lookupResult: MetadataLookupResult<ResultType>,
  fallbackReason?: string | ((reason: MetadataLookupFailureReason) => string),
): void {
  targetDiagnostics.totalLookups += 1;
  if (lookupResult.status === 'success') {
    targetDiagnostics.successfulLookups += 1;
    return;
  }

  targetDiagnostics.degradedLookups += 1;
  targetDiagnostics.failureCounts[lookupResult.status] += 1;
  if (fallbackReason) {
    const formattedReason =
      typeof fallbackReason === 'function'
        ? fallbackReason(lookupResult.status)
        : fallbackReason;
    if (
      formattedReason &&
      !targetDiagnostics.fallbackReasons.includes(formattedReason)
    ) {
      targetDiagnostics.fallbackReasons.push(formattedReason);
    }
  }
}

/**
 * Merge multiple metadata diagnostics objects into a single consolidated summary.
 * WHY: Metadata lookups occur in separate stages (commits, release notes, WHY extraction).
 * Pure merging keeps collection stages decoupled without global mutable state and deduplicates
 * identical fallback reason messages across batches.
 * @param diagnosticsList Diagnostics objects to combine (undefined entries are skipped).
 * @returns Consolidated metadata diagnostics summary.
 */
export function mergeMetadataDiagnostics(
  ...diagnosticsList: readonly (MetadataDiagnostics | undefined)[]
): MetadataDiagnostics {
  const consolidated = createMetadataDiagnostics();

  for (const diagnosticsEntry of diagnosticsList) {
    if (!diagnosticsEntry) continue;

    consolidated.totalLookups += diagnosticsEntry.totalLookups;
    consolidated.successfulLookups += diagnosticsEntry.successfulLookups;
    consolidated.degradedLookups += diagnosticsEntry.degradedLookups;

    for (const reasonKey of METADATA_LOOKUP_FAILURE_REASONS) {
      const failureCount = diagnosticsEntry.failureCounts[reasonKey];
      consolidated.failureCounts[reasonKey] += failureCount;
    }

    for (const reason of diagnosticsEntry.fallbackReasons) {
      if (!consolidated.fallbackReasons.includes(reason)) {
        consolidated.fallbackReasons.push(reason);
      }
    }
  }

  return consolidated;
}
