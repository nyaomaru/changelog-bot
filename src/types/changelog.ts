import { SECTION_ORDER } from '@/constants/changelog.js';
import type { ReleaseChangeId } from '@/types/release.js';

/** Numeric score per section name used for heuristic category scoring. */
export type CategoryScores = Record<string, number>;

/**
 * Changelog section bucket name derived from SECTION_ORDER.
 * Keeps section identifiers consistent across the codebase.
 */
export type BucketName = (typeof SECTION_ORDER)[number];

/** Stable identity and editable text sent to a classification provider. */
export type ClassificationChange = {
  /** Canonical release-change identifier. */
  id: ReleaseChangeId;
  /** Normalized title used only as classification context. */
  title: string;
};

/** Maps each release-change ID to exactly one changelog category. */
export type CategoryAssignments = Record<ReleaseChangeId, BucketName>;

/** Reconciled classification output and any deterministic fallback notices. */
export type ClassificationResult = {
  /** Validated category assignments keyed by release-change ID. */
  assignments: CategoryAssignments;
  /** Non-fatal reconciliation notices suitable for dry-run diagnostics. */
  diagnostics: string[];
};

/** Source strength behind a deterministic category decision. */
export type ClassificationSignal =
  | 'breaking'
  | 'conventional'
  | 'strong-semantic'
  | 'weak-semantic'
  | 'fallback';

/** Category selected by the canonical deterministic classifier. */
export type DeterministicClassification = {
  /** Selected changelog category. */
  category: BucketName;
  /** Highest-precedence signal responsible for the selection. */
  signal: ClassificationSignal;
};
