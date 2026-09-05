import {
  CONVENTIONAL_PREFIX_RE,
  FEAT_PREFIX_FLEX_RE,
  FIX_PREFIX_FLEX_RE,
  REFACTOR_LIKE_RE,
} from '@/constants/conventional.js';
import type {
  BucketName,
  CategoryAssignments,
  CategoryScores,
  ClassificationChange,
} from '@/types/changelog.js';
import {
  SECTION_ADDED,
  SECTION_CHANGED,
  SECTION_FIXED,
  SECTION_CHORE,
  SECTION_BREAKING_CHANGES,
  SECTION_DOCS,
  SECTION_TEST,
} from '@/constants/changelog.js';
import type { ReleaseChange, ReleaseChangeId } from '@/types/release.js';
import {
  bestCategory,
  scoreCategories,
  SCORE_THRESHOLDS,
} from '@/utils/category-score.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

const TYPE_INTENT_INDICATORS = [
  'type',
  'types',
  'typing',
  'type definition',
  'type definitions',
  'typedef',
  'd.ts',
  'ts type',
  'option type',
];

const FIX_INTENT_INDICATORS = [
  'fix',
  'correct',
  'tighten',
  'narrow',
  'wrong',
  'invalid',
  'incorrect',
  'mismatch',
  'bug',
  'error',
];

const CHANGE_LIKE_INDICATORS = [
  'improve',
  'improvement',
  'enhance',
  'enhancement',
  'optimize',
  'optimization',
  'refine',
  'refinement',
  'streamline',
  'simplify',
  'polish',
  'rework',
  'revise',
  'revamp',
  'stabilize',
  'hardening',
  'harden',
  'tweak',
  'adjust',
  'tune',
  'tuning',
  'retune',
  'fine-tune',
  'fine tune',
  'finetune',
];

const WEAK_REMAP_BUCKETS = new Set<BucketName>([
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_TEST,
]);

function semanticTitleCore(rawTitle: string): string {
  return rawTitle.toLowerCase().replace(CONVENTIONAL_PREFIX_RE, '').trim();
}

function releaseChangeTitles(
  change: ReleaseChange,
  classificationTitle?: string,
): string[] {
  return Array.from(
    new Set(
      [change.rawTitle, change.title, classificationTitle].filter(
        (title): title is string => Boolean(title),
      ),
    ),
  );
}

function shouldMoveChangeLikeTitle(
  title: string,
  currentCategory: BucketName | undefined,
): boolean {
  if (
    !REFACTOR_LIKE_RE.test(title.toLowerCase()) &&
    !isChangeLikeTitle(title)
  ) {
    return false;
  }
  if (currentCategory === SECTION_FIXED) return false;
  if (
    currentCategory &&
    currentCategory !== SECTION_CHORE &&
    currentCategory !== SECTION_ADDED
  ) {
    return false;
  }
  return true;
}

function confidentScoredCategory(scores: CategoryScores): BucketName | null {
  const guidedCategory = bestCategory(scores);

  if (
    guidedCategory === SECTION_FIXED &&
    scores[SECTION_FIXED] >= SCORE_THRESHOLDS.fixed
  ) {
    return SECTION_FIXED;
  }

  if (
    guidedCategory === SECTION_CHANGED &&
    scores[SECTION_CHANGED] >= SCORE_THRESHOLDS.changed
  ) {
    return SECTION_CHANGED;
  }

  if (
    guidedCategory === SECTION_ADDED &&
    scores[SECTION_ADDED] >= SCORE_THRESHOLDS.added
  ) {
    return SECTION_ADDED;
  }

  if (
    guidedCategory === SECTION_BREAKING_CHANGES &&
    scores[SECTION_BREAKING_CHANGES] >= SCORE_THRESHOLDS.breaking
  ) {
    return SECTION_BREAKING_CHANGES;
  }

  return null;
}

function applyScoredWeakBucketRemap(
  adjusted: CategoryAssignments,
  changeId: ReleaseChangeId,
  titles: string[],
): void {
  for (const title of titles) {
    const currentCategory = adjusted[changeId];
    if (!currentCategory || !WEAK_REMAP_BUCKETS.has(currentCategory)) continue;

    const targetCategory = confidentScoredCategory(scoreCategories(title));
    if (!targetCategory) continue;

    adjusted[changeId] = targetCategory;
    return;
  }
}

/**
 * Heuristically detect bug-fix intent from a PR/release title that may not use the `fix:` prefix.
 * WHY: Some changes labeled as refactor/docs/chore actually correct type errors or runtime
 * behavior (e.g., "tighten ... option type"). We re-map such items to the Fixed section
 * to better reflect user-facing impact.
 * @param rawTitle Original title including any conventional prefix.
 * @returns True when the title strongly suggests a bug fix.
 */
export function isImplicitFixTitle(rawTitle: string): boolean {
  if (!rawTitle) return false;
  const core = semanticTitleCore(rawTitle);

  const mentionsType = TYPE_INTENT_INDICATORS.some((keyword) =>
    core.includes(keyword),
  );
  const impliesFix = FIX_INTENT_INDICATORS.some((keyword) =>
    core.includes(keyword),
  );

  // If the core mentions typing/contract and implies a correction, treat as Fixed.
  if (mentionsType && impliesFix) return true;

  // Additional conservative pattern: "narrow type" / "tighten type" without explicit fix word.
  if (mentionsType && (core.includes('narrow') || core.includes('tighten'))) {
    return true;
  }

  return false;
}

/**
 * Detect titles that imply noteworthy behavior changes or internal improvements
 * (not new features), such as tuning/optimizing/improving pipelines.
 * WHY: LLMs and simple fallbacks tend to bucket these as Chore or Added due to
 * verbs like "add". For changelog readers, these are better grouped under Changed.
 * @param rawTitle Original title including any conventional prefix.
 * @returns True when the title suggests a change/improvement.
 */
export function isChangeLikeTitle(rawTitle: string): boolean {
  if (!rawTitle) return false;
  const core = semanticTitleCore(rawTitle);

  // WHY: Avoid broad terms like "update/change" to reduce false positives.
  return CHANGE_LIKE_INDICATORS.some((keyword) => core.includes(keyword));
}

/**
 * Re-map ID-based assignments using deterministic title signals.
 * @param changes Canonical changes containing raw and display titles.
 * @param assignments Category assignments produced by the classifier.
 * @param classificationChanges Normalized titles sent to the classifier.
 * @returns Adjusted assignments keyed by the same stable change IDs.
 */
export function tuneCategoryAssignmentsByTitle(
  changes: ReleaseChange[],
  assignments: CategoryAssignments,
  classificationChanges: ClassificationChange[] = [],
): CategoryAssignments {
  if (!changes.length) return assignments;

  const adjusted = { ...assignments };
  const classificationTitles = new Map(
    classificationChanges.map(({ id, title }) => [id, title]),
  );
  for (const change of changes) {
    const titles = releaseChangeTitles(
      change,
      classificationTitles.get(change.id),
    );
    adjusted[change.id] ??= SECTION_CHORE;

    // Dependency-only updates should remain in Chore to avoid Changed noise.
    if (titles.some(isDependencyUpdateTitle)) {
      adjusted[change.id] = SECTION_CHORE;
      continue;
    }

    if (titles.some(isImplicitFixTitle)) {
      adjusted[change.id] = SECTION_FIXED;
    }

    // Conventional `fix:` prefixes should map to Fixed.
    if (titles.some((title) => FIX_PREFIX_FLEX_RE.test(title))) {
      adjusted[change.id] = SECTION_FIXED;
    }

    // Refactor/perf/style-like items should land in Changed when the current
    // assignment is weak or incorrectly marked as Added.
    if (
      titles.some((title) =>
        shouldMoveChangeLikeTitle(title, adjusted[change.id]),
      )
    ) {
      adjusted[change.id] = SECTION_CHANGED;
    }

    // Conventional `feat:` prefixes override weak provider classifications.
    if (titles.some((title) => FEAT_PREFIX_FLEX_RE.test(title))) {
      adjusted[change.id] = SECTION_ADDED;
    }

    applyScoredWeakBucketRemap(adjusted, change.id, titles);
  }

  return adjusted;
}
