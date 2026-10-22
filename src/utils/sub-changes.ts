import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import type { CommitLite } from '@/types/commit.js';
import {
  normalizeTitle,
  stripConventionalPrefix,
} from '@/utils/title-normalize.js';

/**
 * Structured descriptor for a deterministically discovered sub-change within a pull request.
 */
export type PrSubChangeDescriptor = {
  /** 1-based sub-index within the pull request (e.g., 1 for c1, 2 for c2). */
  subIndex: number;
  /** Normalized title stripped of conventional commit prefixes. */
  title: string;
  /** Original subject or raw title before normalization. */
  rawTitle: string;
  /** Git commit SHA that introduced this sub-change, when derived from a commit. */
  commitSha?: string;
};

// WHY: Restrict sub-change candidates to user-facing Conventional Commit types.
// Chores, test additions, CI updates, and builds do not represent independent release notes.
const USER_FACING_COMMIT_TYPES: ReadonlySet<string> = new Set([
  'feat',
  'fix',
  'perf',
  'refactor',
]);

const GIT_FIXUP_RE = /^(?:fixup!|squash!|amend!)\s*/i;
const MERGE_COMMIT_RE = /^merge\s+(?:branch|pull\s+request|tag)\b/i;

// WHY: Commits addressing review comments, formatting, or minor typos are part of the
// PR development lifecycle, not distinct user-facing sub-changes.
const TRIVIAL_OR_NOISE_RE =
  /^(?:fix(?:ing)?\s+)?(?:typo|lint|formatting|tests?|pr\s+comments?|review\s+comments?)|^(?:address\s+(?:code\s+)?review(?:\s+feedback)?|apply\s+(?:code\s+)?suggestions?|code\s+review(?:\s+feedback)?|review\s+feedback|wip|cleanup|clean\s+up|update\s+(?:tests?|readme|docs?|changelog)|minor\s+fixes?|self\s+review|bump\s+(?:deps|dependencies))\b/i;

// WHY: Commits marked as partial increments or phases are stages of a single feature,
// not independent user-facing sub-changes.
const PARTIAL_COMMIT_RE =
  /\b(?:first|second|third|fourth|fifth|initial|final|additional|another|follow[- ]up)\s+(?:part|step|change|phase|commit)\b|\bpart\s+(?:of|\d+)\b|\bstep\s+\d+\b/i;

/**
 * Inspect a change subject line to determine whether it represents a non-trivial user-facing change.
 * WHY: Commit discovery is strictly restricted to explicit user-facing Conventional Commit types
 * (feat, fix, perf, refactor) so non-conventional lines (e.g. "add tests", "rename helper") never
 * cause false sub-change splits.
 * @param subject Git commit subject line.
 * @returns True if the change represents an eligible user-facing sub-change.
 */
function isUserFacingChange(subject: string): boolean {
  if (GIT_FIXUP_RE.test(subject)) return false;
  if (MERGE_COMMIT_RE.test(subject)) return false;

  const prefixMatch = subject.match(CONVENTIONAL_PREFIX_RE);
  if (!prefixMatch) {
    // WHY: Strict Conventional Commit types only; reject non-conventional subjects to avoid false splits
    return false;
  }

  const commitType = prefixMatch[1]?.toLowerCase();
  if (!commitType || !USER_FACING_COMMIT_TYPES.has(commitType)) {
    return false;
  }

  const stripped = stripConventionalPrefix(subject);
  if (TRIVIAL_OR_NOISE_RE.test(stripped) || TRIVIAL_OR_NOISE_RE.test(subject)) {
    return false;
  }

  return true;
}

/**
 * Deterministically discover distinct sub-changes from commits associated with a pull request.
 * WHY: If the deterministic layer cannot confidently prove that a PR contains multiple
 * independently identifiable changes, it must remain a single pr:<number> change.
 * @param prNumber Pull request number.
 * @param prTitle Pull request title.
 * @param commits Commits associated with the pull request.
 * @returns Array of 2 or more sub-change descriptors, or null if below confidence threshold.
 */
export function detectPrSubChangesFromCommits(
  prNumber: number,
  prTitle: string,
  commits: readonly CommitLite[],
): PrSubChangeDescriptor[] | null {
  if (commits.length < 2) {
    return null;
  }

  // WHY: If one of the commits matches the PR title, the PR was titled after that primary
  // feature and other commits are in-PR follow-ups, not independent sub-changes.
  const normalizedPrTitle = normalizeTitle(prTitle);
  if (
    normalizedPrTitle &&
    commits.some(
      (commit) => normalizeTitle(commit.subject) === normalizedPrTitle,
    )
  ) {
    return null;
  }

  // WHY: Commits marked as partial increments (e.g., "first part of feature", "second change")
  // are stages of a single larger feature rather than separate user-facing changes.
  if (commits.some((commit) => PARTIAL_COMMIT_RE.test(commit.subject))) {
    return null;
  }

  const candidateCommits: CommitLite[] = [];
  const seenSemanticKeys = new Set<string>();

  for (const commit of commits) {
    if (!isUserFacingChange(commit.subject)) {
      continue;
    }

    const semanticKey = normalizeTitle(commit.subject);
    if (!semanticKey) {
      continue;
    }

    if (seenSemanticKeys.has(semanticKey)) {
      // WHY: Collapsing identical or follow-up commits under the same semantic subject
      // prevents repetitive sub-changes for the same core capability.
      continue;
    }

    seenSemanticKeys.add(semanticKey);
    candidateCommits.push(commit);
  }

  // Invariant: At least 2 distinct user-facing semantic subjects are required
  if (candidateCommits.length < 2) {
    return null;
  }

  return candidateCommits.map((commit, index) => ({
    subIndex: index + 1,
    title: stripConventionalPrefix(commit.subject),
    rawTitle: commit.subject,
    commitSha: commit.sha,
  }));
}
