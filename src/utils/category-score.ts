import { SECTION_ORDER } from '@/constants/changelog.js';
import {
  BEST_CATEGORY_MIN_SCORE,
  BEST_CATEGORY_REQUIRED_MARGIN,
} from '@/constants/category-scoring.js';
import type { BucketName, CategoryScores } from '@/types/changelog.js';
import {
  applyComboHeuristics,
  applyDependencyBumpHeuristic,
  applyNegativeSignalAttenuation,
  clampCategoryScores,
  collectPrefixScoreDeltas,
} from '@/utils/category-score-heuristics.js';
import {
  collectKeywordScoreDeltas,
  createNormalizedPhrases,
} from '@/utils/category-score-keywords.js';
import { isNullable } from '@/utils/is.js';
import { normalizeTitle } from '@/utils/title-normalize.js';

export { SCORE_THRESHOLDS } from '@/constants/category-scoring.js';

type ScoreDeltas = Partial<Record<BucketName, number>>;

/**
 * Initialize an empty score object with zero for every section.
 * @returns Fresh category scores with all sections set to zero.
 */
function createEmptyScores(): CategoryScores {
  const categoryScores = {} as CategoryScores;
  for (const section of SECTION_ORDER) categoryScores[section] = 0;
  return categoryScores;
}

/**
 * Add score deltas to a mutable score object.
 * @param scores Score object to mutate.
 * @param deltas Per-section deltas to apply.
 */
function addScoreDeltas(scores: CategoryScores, deltas: ScoreDeltas): void {
  for (const [sectionName, weight] of Object.entries(deltas) as Array<
    [BucketName, number]
  >) {
    scores[sectionName] += weight;
  }
}

/**
 * Compute heuristic scores per category from a raw title.
 * @param rawTitle Original PR title or commit subject.
 * @returns Scores for each CHANGELOG section.
 */
export function scoreCategories(rawTitle: string): CategoryScores {
  const scores = createEmptyScores();
  if (!rawTitle) return scores;

  const lowercasedTitle = rawTitle.toLowerCase();
  const normalizedTitle = normalizeTitle(lowercasedTitle);
  const normalizedPhrases = createNormalizedPhrases(normalizedTitle);

  addScoreDeltas(scores, collectPrefixScoreDeltas(rawTitle, lowercasedTitle));
  addScoreDeltas(scores, collectKeywordScoreDeltas(normalizedPhrases));

  applyNegativeSignalAttenuation(scores, normalizedPhrases);
  applyComboHeuristics(scores, normalizedTitle);
  applyDependencyBumpHeuristic(scores, normalizedTitle);
  clampCategoryScores(scores);

  return scores;
}

/**
 * Select the best category using a minimum score and margin rule.
 * @param scores Category scores computed by `scoreCategories`.
 * @returns Best section name, or null if inconclusive.
 */
export function bestCategory(scores: CategoryScores): BucketName | null {
  let topSection: BucketName | undefined;
  let secondSection: BucketName | undefined;
  for (const section of SECTION_ORDER) {
    if (isNullable(topSection) || scores[section] > scores[topSection]) {
      secondSection = topSection;
      topSection = section;
    } else if (
      isNullable(secondSection) ||
      scores[section] > scores[secondSection]
    ) {
      secondSection = section;
    }
  }

  if (isNullable(topSection)) return null;
  const topScore = scores[topSection];
  const secondScore = isNullable(secondSection) ? 0 : scores[secondSection];
  if (
    topScore >= BEST_CATEGORY_MIN_SCORE &&
    topScore - secondScore >= BEST_CATEGORY_REQUIRED_MARGIN
  ) {
    return topSection;
  }
  return null;
}
