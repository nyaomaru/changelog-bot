import type {
  ReleaseChange,
  ReleaseDraft,
  ReleaseResult,
} from '@/types/release.js';
import type { BucketName, CategoryAssignments } from '@/types/changelog.js';
import type { EditorialOutput } from '@/schema/editorial.js';
import { applyDeterministicClassification } from '@/utils/deterministic-classification.js';
import { SECTION_ORDER } from '@/constants/changelog.js';

export type ReconcileEditorialResult = {
  /** Updated release result after sparse editorial enrichment and hard rule enforcement. */
  result: ReleaseResult;
  /** Polished pull request title if returned by the provider. */
  prTitle?: string;
  /** Polished pull request body if returned by the provider. */
  prBody?: string;
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
 * @returns Validated release result and delivery metadata.
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

  const knownIds = new Set(draft.changes.map((change) => change.id));
  const validCategories = new Set<string>(SECTION_ORDER);

  // Deep copy changes and assignments to keep pure behavior
  const updatedChanges: ReleaseChange[] = draft.changes.map((change) => ({
    ...change,
  }));
  const updatedAssignments: CategoryAssignments = {
    ...draft.assignments,
  } as CategoryAssignments;
  const changesById = new Map<string, ReleaseChange>(
    updatedChanges.map((change) => [change.id, change]),
  );

  const unknownIds: string[] = [];

  for (const [id, edit] of Object.entries(editorial.changes ?? {})) {
    if (!knownIds.has(id as ReleaseChange['id'])) {
      unknownIds.push(id);
      continue;
    }

    const change = changesById.get(id);
    if (!change) continue;

    // Apply title polishing if non-empty string is provided
    if (typeof edit.title === 'string' && edit.title.trim().length > 0) {
      change.title = edit.title.trim();
    }

    // Apply category suggestion if valid category name
    if (
      typeof edit.category === 'string' &&
      validCategories.has(edit.category)
    ) {
      updatedAssignments[id as ReleaseChange['id']] =
        edit.category as BucketName;
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
    prTitle: editorial.pr_title?.trim() || undefined,
    prBody: editorial.pr_body?.trim() || undefined,
    diagnostics,
  };
}
