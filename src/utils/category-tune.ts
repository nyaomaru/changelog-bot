import {
  CONVENTIONAL_PREFIX_RE,
  FEAT_PREFIX_FLEX_RE,
  FIX_PREFIX_FLEX_RE,
  REFACTOR_LIKE_RE,
} from '@/constants/conventional.js';
import type {
  BucketName,
  CategoryMap,
  CategoryScores,
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
import type { ReleaseItem } from '@/types/release.js';
import {
  bestCategory,
  scoreCategories,
  SCORE_THRESHOLDS,
} from '@/utils/category-score.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';
import { isBucketName } from '@/utils/is.js';

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

const REQUIRED_CATEGORY_BUCKETS = [
  SECTION_FIXED,
  SECTION_CHANGED,
  SECTION_ADDED,
] as const;

const WEAK_REMAP_BUCKETS = new Set<BucketName>([
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_TEST,
]);

function semanticTitleCore(rawTitle: string): string {
  return rawTitle.toLowerCase().replace(CONVENTIONAL_PREFIX_RE, '').trim();
}

function collectKnownTitles(
  items: ReleaseItem[],
  categories: CategoryMap,
): string[] {
  const knownTitles = new Set<string>();

  for (const item of items) {
    if (item.rawTitle) knownTitles.add(item.rawTitle);
    knownTitles.add(item.title);
  }

  for (const list of Object.values(categories)) {
    if (!Array.isArray(list)) continue;
    for (const title of list) {
      knownTitles.add(title);
    }
  }

  return Array.from(knownTitles);
}

function cloneCategoryMap(categories: CategoryMap): CategoryMap {
  const adjusted: CategoryMap = Object.fromEntries(
    Object.entries(categories).map(([section, list]) => [
      section,
      Array.isArray(list) ? list.slice() : [],
    ]),
  );

  for (const section of REQUIRED_CATEGORY_BUCKETS) {
    if (!adjusted[section]) adjusted[section] = [];
  }

  return adjusted;
}

/**
 * Move given titles to a target category on a mutable CategoryMap.
 * - Removes titles from all buckets first to avoid duplicates.
 * - Ensures the target bucket exists and appends uniquely.
 */
function moveTitlesToCategory(
  adjusted: CategoryMap,
  titles: string[],
  targetCategory: BucketName,
): void {
  if (!Array.isArray(adjusted[targetCategory])) adjusted[targetCategory] = [];
  const target = adjusted[targetCategory];
  for (const title of titles) {
    for (const list of Object.values(adjusted)) {
      if (!Array.isArray(list)) continue;
      const titleIndex = list.indexOf(title);
      if (titleIndex !== -1) list.splice(titleIndex, 1);
    }
    if (!target.includes(title)) target.push(title);
  }
}

function collectMatchingTitles(
  titles: string[],
  predicate: (title: string) => boolean,
): string[] {
  return titles.filter((title) => predicate(title));
}

function findCategory(
  categories: CategoryMap,
  title: string,
): BucketName | undefined {
  for (const [section, list] of Object.entries(categories)) {
    if (Array.isArray(list) && list.includes(title) && isBucketName(section)) {
      return section;
    }
  }
  return undefined;
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

function applyScoredWeakBucketRemaps(
  adjusted: CategoryMap,
  titles: string[],
): void {
  for (const title of titles) {
    const currentCategory = findCategory(adjusted, title);
    if (!currentCategory || !WEAK_REMAP_BUCKETS.has(currentCategory)) continue;

    const targetCategory = confidentScoredCategory(scoreCategories(title));
    if (!targetCategory) continue;

    moveTitlesToCategory(adjusted, [title], targetCategory);
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
 * Re-map category assignments so that titles implying a fix (e.g., type tightening) land in `Fixed`.
 * @param items Parsed release items (with rawTitle/title values).
 * @param categories Category mapping produced by the classifier.
 * @returns Adjusted CategoryMap with qualifying titles moved to `Fixed`.
 */
export function tuneCategoriesByTitle(
  items: ReleaseItem[],
  categories: CategoryMap,
): CategoryMap {
  if (!items.length) return categories;

  const adjusted = cloneCategoryMap(categories);
  const allKnownTitles = collectKnownTitles(items, categories);

  // Rule: Dependency-only updates should remain in Chore to avoid noise in Changed.
  const dependencyUpdates = collectMatchingTitles(
    allKnownTitles,
    isDependencyUpdateTitle,
  );
  if (dependencyUpdates.length)
    moveTitlesToCategory(adjusted, dependencyUpdates, SECTION_CHORE);
  const dependencyUpdateSet = new Set(dependencyUpdates);
  const nonDependencyTitles = allKnownTitles.filter(
    (title) => !dependencyUpdateSet.has(title),
  );

  const implicitFixes = collectMatchingTitles(
    nonDependencyTitles,
    isImplicitFixTitle,
  );
  if (implicitFixes.length)
    moveTitlesToCategory(adjusted, implicitFixes, SECTION_FIXED);

  // Rule: Conventional `fix:` prefix should map to Fixed.
  const conventionalFixes = collectMatchingTitles(
    nonDependencyTitles,
    (title) => FIX_PREFIX_FLEX_RE.test(title),
  );
  if (conventionalFixes.length)
    moveTitlesToCategory(adjusted, conventionalFixes, SECTION_FIXED);

  // Secondary rule: refactor/perf/style-like items should land in Changed when misclassified as Chore or missing.
  const changeLikeTitles = nonDependencyTitles.filter((title) =>
    shouldMoveChangeLikeTitle(title, findCategory(adjusted, title)),
  );
  if (changeLikeTitles.length)
    moveTitlesToCategory(adjusted, changeLikeTitles, SECTION_CHANGED);

  // Rule: Conventional `feat:` prefix should map to Added (guard against LLM
  // placing features under Chore/Changed due to generic verbs like "add/support").
  const featureTitles = collectMatchingTitles(nonDependencyTitles, (title) =>
    FEAT_PREFIX_FLEX_RE.test(title),
  );
  if (featureTitles.length)
    moveTitlesToCategory(adjusted, featureTitles, SECTION_ADDED);

  applyScoredWeakBucketRemaps(adjusted, nonDependencyTitles);

  return adjusted;
}
