import {
  SECTION_ADDED,
  SECTION_BREAKING_CHANGES,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_FIXED,
  SECTION_ORDER,
  SECTION_TEST,
} from '@/constants/changelog.js';
import {
  CATEGORY_WEIGHTS,
  NGRAM_MAX_WORDS,
  WEAK_KEYWORD_WEIGHT,
  WEIGHT,
  type WeightedKeyword,
} from '@/constants/category-scoring.js';
import type { BucketName } from '@/types/changelog.js';

type ScoreDeltas = Partial<Record<BucketName, number>>;

type KeywordIndex = Map<string, Array<{ section: BucketName; weight: number }>>;

function addKeywordToIndex(
  index: KeywordIndex,
  section: BucketName,
  entry: WeightedKeyword,
  defaultWeight: number,
): void {
  const { keyword, weight } =
    typeof entry === 'string'
      ? { keyword: entry, weight: defaultWeight }
      : entry;
  const existingEntries = index.get(keyword) || [];
  existingEntries.push({ section, weight });
  index.set(keyword, existingEntries);
}

function buildKeywordIndex(
  groups: Array<{
    section: BucketName;
    entries: readonly WeightedKeyword[];
  }>,
  defaultWeight: number,
): KeywordIndex {
  const index: KeywordIndex = new Map();
  for (const { section, entries } of groups) {
    for (const entry of entries) {
      addKeywordToIndex(index, section, entry, defaultWeight);
    }
  }
  return index;
}

// WHY: Build keyword indices once at module initialization to avoid per-title allocation.
const STRONG_KEYWORD_INDEX: KeywordIndex = buildKeywordIndex(
  [
    {
      section: SECTION_BREAKING_CHANGES,
      entries: CATEGORY_WEIGHTS.strong.breaking,
    },
    { section: SECTION_ADDED, entries: CATEGORY_WEIGHTS.strong.added },
    { section: SECTION_FIXED, entries: CATEGORY_WEIGHTS.strong.fixed },
    { section: SECTION_CHANGED, entries: CATEGORY_WEIGHTS.strong.changed },
    { section: SECTION_DOCS, entries: CATEGORY_WEIGHTS.strong.docs },
    { section: SECTION_TEST, entries: CATEGORY_WEIGHTS.strong.test },
    { section: SECTION_CHORE, entries: CATEGORY_WEIGHTS.strong.chore },
  ],
  WEIGHT.strong.default,
);

const WEAK_KEYWORD_INDEX: KeywordIndex = buildKeywordIndex(
  [
    { section: SECTION_ADDED, entries: CATEGORY_WEIGHTS.weak.added },
    { section: SECTION_FIXED, entries: CATEGORY_WEIGHTS.weak.fixed },
    { section: SECTION_CHANGED, entries: CATEGORY_WEIGHTS.weak.changed },
    { section: SECTION_DOCS, entries: CATEGORY_WEIGHTS.weak.docs },
    { section: SECTION_CHORE, entries: CATEGORY_WEIGHTS.weak.chore },
  ],
  WEAK_KEYWORD_WEIGHT,
);

/**
 * Generate normalized words and short n-grams for keyword matching.
 * @param normalizedTitle Title after lowercasing and normalization.
 * @returns Unique phrases eligible for keyword scoring.
 */
export function createNormalizedPhrases(normalizedTitle: string): Set<string> {
  const words = normalizedTitle.split(/\s+/).filter(Boolean);
  const shouldUseNgrams = words.length <= NGRAM_MAX_WORDS;
  if (!shouldUseNgrams) return new Set(words);

  const phrases = new Set(words);
  for (let wordIndex = 0; wordIndex < words.length - 1; wordIndex++) {
    phrases.add(`${words[wordIndex]} ${words[wordIndex + 1]}`);
  }
  for (let wordIndex = 0; wordIndex < words.length - 2; wordIndex++) {
    phrases.add(
      `${words[wordIndex]} ${words[wordIndex + 1]} ${words[wordIndex + 2]}`,
    );
  }
  return phrases;
}

function collectKeywordFamilyDeltas(
  normalizedPhrases: Set<string>,
  keywordIndex: KeywordIndex,
): ScoreDeltas {
  const deltas: ScoreDeltas = {};
  for (const phrase of normalizedPhrases) {
    const keywordHits = keywordIndex.get(phrase);
    if (!keywordHits) continue;
    for (const { section, weight } of keywordHits) {
      deltas[section] = Math.max(deltas[section] || 0, weight);
    }
  }
  return deltas;
}

/**
 * Collect strong and weak keyword score contributions for a title.
 * WHY: Each keyword family is capped independently, so a strong and a weak
 * signal for the same section still accumulate exactly once per family.
 * @param normalizedPhrases Normalized words and n-grams from the title.
 * @returns Combined per-section keyword score deltas.
 */
export function collectKeywordScoreDeltas(
  normalizedPhrases: Set<string>,
): ScoreDeltas {
  const strongDeltas = collectKeywordFamilyDeltas(
    normalizedPhrases,
    STRONG_KEYWORD_INDEX,
  );
  const weakDeltas = collectKeywordFamilyDeltas(
    normalizedPhrases,
    WEAK_KEYWORD_INDEX,
  );
  const combinedDeltas: ScoreDeltas = {};

  for (const section of SECTION_ORDER) {
    const combinedScore =
      (strongDeltas[section] || 0) + (weakDeltas[section] || 0);
    if (combinedScore !== 0) combinedDeltas[section] = combinedScore;
  }
  return combinedDeltas;
}
