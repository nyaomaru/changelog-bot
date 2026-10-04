import type {
  ReleaseChange,
  ReleaseDraft,
  ReleaseResult,
} from '@/types/release.js';
import type { CategoryAssignments } from '@/types/changelog.js';
import type { EditorialOutput } from '@/schema/editorial.js';
import { applyDeterministicClassification } from '@/utils/deterministic-classification.js';
import { isBucketName } from '@/utils/is.js';

export type ReconcileEditorialResult = {
  /** Updated release result after sparse editorial enrichment and hard rule enforcement. */
  result: ReleaseResult;
  /** Diagnostics regarding omitted, unknown, or rejected editorial edits. */
  diagnostics: string[];
};

/**
 * Reconcile sparse editorial edits against an authoritative ReleaseDraft.
 * WHY: The draft is already complete and valid. Unknown IDs are rejected,
 * missing IDs retain source values, and deterministic classification precedence
 * overrides any non-compliant category suggestion.
 * @param draft Authoritative pre-AI release draft.
 * @param editorial Sparse edits returned by the LLM provider.
 * @returns Validated release result and diagnostics.
 */
export function reconcileEditorialOutput(
  draft: ReleaseDraft,
  editorial?: EditorialOutput,
): ReconcileEditorialResult {
  const diagnostics: string[] = [];
  if (!editorial) {
    return {
      result: {
        ...draft,
        changes: draft.changes.map((change) => ({ ...change })),
        assignments: { ...draft.assignments },
      },
      diagnostics,
    };
  }

  // Deep copy changes and assignments to keep pure behavior
  const updatedChanges: ReleaseChange[] = draft.changes.map((change) => ({
    ...change,
  }));
  const updatedAssignments: CategoryAssignments = {
    ...draft.assignments,
  };
  const changesById = new Map<string, ReleaseChange>(
    updatedChanges.map((change) => [change.id, change]),
  );

  const unknownIds: string[] = [];

  for (const [id, edit] of Object.entries(editorial.changes ?? {})) {
    const change = changesById.get(id);
    if (!change) {
      unknownIds.push(id);
      continue;
    }

    // Apply title polishing if non-empty string is provided (normalize single-line)
    if (typeof edit.title === 'string' && edit.title.trim().length > 0) {
      change.title = edit.title.replace(/[\r\n]+/g, ' ').trim();
    }

    // Apply category suggestion if valid category name without type assertion
    if (isBucketName(edit.category)) {
      updatedAssignments[change.id] = edit.category;
    }
  }

  if (unknownIds.length > 0) {
    diagnostics.push(
      `Editorial output contained ${unknownIds.length} unknown ID(s): ${unknownIds.join(', ')}; rejected`,
    );
  }

  // Authoritative hard rule enforcement: deterministic rules (Breaking Changes, Conventional commit types)
  // always take precedence over AI suggestions.
  const finalizedAssignments = applyDeterministicClassification(
    updatedChanges,
    updatedAssignments,
  );

  const result: ReleaseResult = {
    ...draft,
    changes: updatedChanges,
    assignments: finalizedAssignments,
  };

  return {
    result,
    diagnostics,
  };
}
