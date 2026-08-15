import {
  SECTION_ADDED,
  SECTION_BREAKING_CHANGES,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_FIXED,
  SECTION_ORDER,
  SECTION_REVERTED,
  SECTION_TEST,
} from '@/constants/changelog.js';
import {
  CHORE_PREFIX_FLEX_RE,
  DOCS_PREFIX_FLEX_RE,
  FEAT_PREFIX_FLEX_RE,
  FIX_PREFIX_FLEX_RE,
  PERF_PREFIX_FLEX_RE,
  REFACTOR_PERF_STYLE_PREFIX_FLEX_RE,
  REVERT_PREFIX_FLEX_RE,
  TEST_PREFIX_FLEX_RE,
} from '@/constants/conventional.js';
import {
  CATEGORY_WEIGHTS,
  NEGATIVE_ATTENUATION_WEIGHT,
  SCORE_MAX,
  SCORE_MIN,
  WEAK_KEYWORD_WEIGHT,
  WEIGHT,
  WEIGHT_LEVEL,
} from '@/constants/category-scoring.js';
import {
  BREAKING_PREFIX_MARKER_RE,
  BUMP_OR_UPGRADE_RE,
  COMBO_ADD_TO_IMPROVE_RE,
  COMBO_FIX_BY_ADDING_RE,
  COMBO_REMOVE_WITHOUT_REPLACEMENT_RE,
  COMBO_TIGHTEN_TYPE_RE,
  VERSION_FROM_TO_RE,
} from '@/constants/scoring.js';
import type { BucketName, CategoryScores } from '@/types/changelog.js';

type ScoreDeltas = Partial<Record<BucketName, number>>;

/**
 * Check the first line of a title for a breaking conventional prefix marker.
 * Accepts both `type!: message` and `type(scope)!: message` forms.
 * @param rawTitle Original PR title or commit subject.
 * @returns True when the first line contains a breaking prefix marker.
 */
function hasBreakingMarkerInPrefix(rawTitle: string): boolean {
  return BREAKING_PREFIX_MARKER_RE.test(rawTitle.split('\n')[0] || '');
}

/**
 * Score conventional-prefix signals from a title.
 * @param rawTitle Original title, preserving prefix punctuation.
 * @param lowercasedTitle Lowercased title used by prefix regexes.
 * @returns Per-section prefix score deltas.
 */
export function collectPrefixScoreDeltas(
  rawTitle: string,
  lowercasedTitle: string,
): ScoreDeltas {
  const deltas: ScoreDeltas = {};
  if (hasBreakingMarkerInPrefix(rawTitle)) {
    deltas[SECTION_BREAKING_CHANGES] = CATEGORY_WEIGHTS.prefix.breaking;
  }
  if (FEAT_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_ADDED] = CATEGORY_WEIGHTS.prefix.feat;
  }
  if (FIX_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_FIXED] = CATEGORY_WEIGHTS.prefix.fix;
  }
  if (REFACTOR_PERF_STYLE_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_CHANGED] = Math.max(
      CATEGORY_WEIGHTS.prefix.refactor,
      PERF_PREFIX_FLEX_RE.test(lowercasedTitle)
        ? CATEGORY_WEIGHTS.prefix.perf
        : CATEGORY_WEIGHTS.prefix.refactor,
    );
  }
  if (DOCS_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_DOCS] = CATEGORY_WEIGHTS.prefix.docs;
  }
  if (TEST_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_TEST] = CATEGORY_WEIGHTS.prefix.test;
  }
  if (REVERT_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_REVERTED] = CATEGORY_WEIGHTS.prefix.revert;
  }
  if (CHORE_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    deltas[SECTION_CHORE] = CATEGORY_WEIGHTS.prefix.chore;
  }
  return deltas;
}

/**
 * Attenuate the strongest main category when a title includes uncertainty signals.
 * @param scores Mutable scores to adjust.
 * @param normalizedPhrases Normalized words and n-grams from the title.
 */
export function applyNegativeSignalAttenuation(
  scores: CategoryScores,
  normalizedPhrases: Set<string>,
): void {
  const hasNegativeSignal = CATEGORY_WEIGHTS.negative.some(({ keyword }) =>
    normalizedPhrases.has(keyword),
  );
  if (!hasNegativeSignal) return;
  const candidateSections: BucketName[] = [
    SECTION_FIXED,
    SECTION_CHANGED,
    SECTION_ADDED,
  ];
  let bestSection: BucketName | null = null;
  let bestScore = -Infinity;
  for (const section of candidateSections) {
    if (scores[section] > bestScore) {
      bestScore = scores[section];
      bestSection = section;
    }
  }
  if (bestSection) {
    scores[bestSection] = Math.max(
      scores[bestSection] - NEGATIVE_ATTENUATION_WEIGHT,
      SCORE_MIN,
    );
  }
}

/**
 * Apply phrase-combination heuristics that need regex context beyond n-grams.
 * @param scores Mutable scores to adjust.
 * @param normalizedTitle Normalized title used by combination regexes.
 */
export function applyComboHeuristics(
  scores: CategoryScores,
  normalizedTitle: string,
): void {
  if (COMBO_ADD_TO_IMPROVE_RE.test(normalizedTitle)) {
    scores[SECTION_ADDED] += WEAK_KEYWORD_WEIGHT;
    scores[SECTION_CHANGED] += WEIGHT.strong.default;
  }
  if (COMBO_TIGHTEN_TYPE_RE.test(normalizedTitle)) {
    scores[SECTION_FIXED] += WEIGHT.strong.default;
    scores[SECTION_CHANGED] += WEAK_KEYWORD_WEIGHT;
  }
  if (COMBO_FIX_BY_ADDING_RE.test(normalizedTitle)) {
    scores[SECTION_FIXED] += WEIGHT.strong.default;
    scores[SECTION_ADDED] += WEAK_KEYWORD_WEIGHT;
  }
  if (COMBO_REMOVE_WITHOUT_REPLACEMENT_RE.test(normalizedTitle)) {
    scores[SECTION_BREAKING_CHANGES] += WEIGHT.strong.high;
    scores[SECTION_CHANGED] += WEAK_KEYWORD_WEIGHT;
  }
}

/**
 * Apply dependency-version bump heuristics.
 * @param scores Mutable scores to adjust.
 * @param normalizedTitle Normalized title used by dependency regexes.
 */
export function applyDependencyBumpHeuristic(
  scores: CategoryScores,
  normalizedTitle: string,
): void {
  if (!BUMP_OR_UPGRADE_RE.test(normalizedTitle)) return;
  scores[SECTION_CHORE] += WEIGHT_LEVEL.low;
  const versionRangeMatch = normalizedTitle.match(VERSION_FROM_TO_RE);
  if (!versionRangeMatch) return;
  const fromMajorVersion = parseInt(versionRangeMatch[1], 10);
  const toMajorVersion = parseInt(versionRangeMatch[2], 10);
  if (
    !Number.isNaN(fromMajorVersion) &&
    !Number.isNaN(toMajorVersion) &&
    toMajorVersion > fromMajorVersion
  ) {
    scores[SECTION_BREAKING_CHANGES] += WEIGHT_LEVEL.low;
    scores[SECTION_CHANGED] += WEAK_KEYWORD_WEIGHT;
  }
}

/**
 * Clamp all category scores to the supported scoring range.
 * @param scores Mutable scores to clamp.
 */
export function clampCategoryScores(scores: CategoryScores): void {
  for (const section of SECTION_ORDER) {
    scores[section] = Math.max(SCORE_MIN, Math.min(SCORE_MAX, scores[section]));
  }
}
