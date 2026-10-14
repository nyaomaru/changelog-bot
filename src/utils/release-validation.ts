import type {
  ReleaseChange,
  ReleaseChangeId,
  ReleaseOutcome,
  ReleaseResult,
} from '@/types/release.js';
import { ReleaseValidationError } from '@/lib/errors.js';

export { ReleaseValidationError };

/**
 * Validate a release draft or result for completeness, disjointness, and absence of duplicate change IDs.
 * WHY: Enforces Phase 5 completeness: every source change must be accounted for either in
 * included changes or in excludedChanges with a typed reason. Rejects duplicate IDs in changes.
 * Returns a typed ReleaseOutcome indicating either a populated release or no changes.
 * @param result The release result or draft to validate.
 * @param sourceChanges Optional list of original source changes to verify complete accounting.
 * @returns Discriminated union of either a validated release result or a typed no-changes outcome.
 * @throws {ReleaseValidationError} When duplicate IDs or unaccounted/overlapping changes are found.
 */
export function validateReleaseResult(
  result: ReleaseResult,
  sourceChanges?: readonly ReleaseChange[],
): ReleaseOutcome {
  const seenChangeIds = new Set<ReleaseChangeId>();

  for (const change of result.changes) {
    if (seenChangeIds.has(change.id)) {
      throw new ReleaseValidationError(
        `Duplicate change ID in changes: ${change.id}`,
      );
    }
    seenChangeIds.add(change.id);
  }

  const seenExcludedIds = new Set<ReleaseChangeId>();
  for (const excluded of result.excludedChanges ?? []) {
    if (seenChangeIds.has(excluded.change.id)) {
      throw new ReleaseValidationError(
        `Change ID '${excluded.change.id}' appears in both changes and excludedChanges`,
      );
    }
    if (seenExcludedIds.has(excluded.change.id)) {
      throw new ReleaseValidationError(
        `Duplicate change ID in excludedChanges: ${excluded.change.id}`,
      );
    }
    seenExcludedIds.add(excluded.change.id);
  }

  if (sourceChanges) {
    for (const source of sourceChanges) {
      const inChanges = seenChangeIds.has(source.id);
      const inExcluded = seenExcludedIds.has(source.id);
      if (!inChanges && !inExcluded) {
        throw new ReleaseValidationError(
          `Source change '${source.id}' missing from release result without an exclusion reason`,
        );
      }
    }
  }

  const hasSections = Boolean(result.sections?.length);
  if (result.changes.length === 0 && !hasSections) {
    return {
      kind: 'no-changes',
      version: result.version,
      date: result.date,
      excludedChanges: result.excludedChanges ?? [],
    };
  }

  return {
    kind: 'release',
    result,
  };
}
