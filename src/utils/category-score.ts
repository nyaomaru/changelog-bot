import {
  SECTION_ORDER,
  SECTION_ADDED,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_FIXED,
  SECTION_REVERTED,
  SECTION_TEST,
  SECTION_BREAKING_CHANGES,
} from '@/constants/changelog.js';
import type { CategoryScores } from '@/types/changelog.js';
import { normalizeTitle } from '@/utils/title-normalize.js';
import {
  FEAT_PREFIX_FLEX_RE,
  FIX_PREFIX_FLEX_RE,
  REFACTOR_PERF_STYLE_PREFIX_FLEX_RE,
  DOCS_PREFIX_FLEX_RE,
  TEST_PREFIX_FLEX_RE,
  REVERT_PREFIX_FLEX_RE,
  CHORE_PREFIX_FLEX_RE,
  PERF_PREFIX_FLEX_RE,
} from '@/constants/conventional.js';
import {
  BREAKING_PREFIX_MARKER_RE,
  COMBO_ADD_TO_IMPROVE_RE,
  COMBO_TIGHTEN_TYPE_RE,
  COMBO_FIX_BY_ADDING_RE,
  COMBO_REMOVE_WITHOUT_REPLACEMENT_RE,
  BUMP_OR_UPGRADE_RE,
  VERSION_FROM_TO_RE,
} from '@/constants/scoring.js';
import { isNullable } from '@/utils/is.js';
import type { BucketName } from '@/types/changelog.js';

// WHY: Centralize weight levels to avoid magic numbers and to make tuning clearer.
const WEIGHT_LEVEL = {
  low: 2,
  default: 3,
  high: 4,
  veryHigh: 5,
} as const;

const NEGATIVE_LEVEL = {
  mild: -1,
  medium: -2,
  strong: -3,
} as const;

// WHY: Keep weights deterministic and self-descriptive (no magic numbers).
const WEIGHT = {
  prefix: {
    breaking: WEIGHT_LEVEL.veryHigh,
    feat: WEIGHT_LEVEL.high,
    fix: WEIGHT_LEVEL.high,
    refactor: WEIGHT_LEVEL.default,
    perf: WEIGHT_LEVEL.default,
    style: WEIGHT_LEVEL.low,
    docs: WEIGHT_LEVEL.default,
    test: WEIGHT_LEVEL.default,
    revert: WEIGHT_LEVEL.high,
    chore: WEIGHT_LEVEL.low,
  },
  strong: {
    default: WEIGHT_LEVEL.default,
    high: WEIGHT_LEVEL.high,
    veryHigh: WEIGHT_LEVEL.veryHigh,
  },
  negative: {
    mild: NEGATIVE_LEVEL.mild,
    medium: NEGATIVE_LEVEL.medium,
    strong: NEGATIVE_LEVEL.strong,
  },
} as const;

// Default weights used by the scoring heuristic.
const CATEGORY_WEIGHTS = {
  prefix: {
    breaking: WEIGHT.prefix.breaking,
    feat: WEIGHT.prefix.feat,
    fix: WEIGHT.prefix.fix,
    refactor: WEIGHT.prefix.refactor,
    perf: WEIGHT.prefix.perf,
    style: WEIGHT.prefix.style,
    docs: WEIGHT.prefix.docs,
    test: WEIGHT.prefix.test,
    revert: WEIGHT.prefix.revert,
    chore: WEIGHT.prefix.chore,
    // build/ci contribute to chore via keywords, not separate section
  },
  strong: {
    breaking: [
      { keyword: 'breaking change', weight: WEIGHT.strong.veryHigh },
      { keyword: 'incompatible', weight: WEIGHT.strong.high },
      { keyword: 'remove support', weight: WEIGHT.strong.high },
      { keyword: 'drop support', weight: WEIGHT.strong.high },
      { keyword: 'deprecate', weight: WEIGHT.strong.default },
      { keyword: 'removal', weight: WEIGHT.strong.default },
      { keyword: 'api change', weight: WEIGHT.strong.default },
    ],
    added: [
      'add',
      'introduce',
      'implement',
      'support',
      'enable',
      'expose',
      'create',
      'new',
      'initial',
      'opt in',
      'integrate',
    ],
    fixed: [
      { keyword: 'regression', weight: WEIGHT.strong.high },
      { keyword: 'crash', weight: WEIGHT.strong.high },
      'fix',
      'bug',
      'prevent',
      'correct',
      'wrong',
      'invalid',
      'incorrect',
      'mismatch',
      'error',
      'null',
      'undefined',
      'edge case',
      'panic',
      { keyword: 'security', weight: WEIGHT.strong.high },
      { keyword: 'vuln', weight: WEIGHT.strong.high },
      { keyword: 'cve', weight: WEIGHT.strong.veryHigh },
      { keyword: 'xss', weight: WEIGHT.strong.veryHigh },
      { keyword: 'csrf', weight: WEIGHT.strong.veryHigh },
      { keyword: 'rce', weight: WEIGHT.strong.veryHigh },
      { keyword: 'dos', weight: WEIGHT.strong.veryHigh },
    ],
    changed: [
      'improve',
      'improvement',
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
      'harden',
      'tuning',
      'fine tune',
      'adjust',
      'tweak',
    ],
    docs: ['docs', 'readme', 'guide', 'tutorial', 'reference', 'comment'],
    test: [
      'test',
      'tests',
      'e2e',
      'integration',
      'unit',
      'snapshot',
      'coverage',
      'mock',
      'fixture',
    ],
    chore: [
      'build',
      'pipeline',
      'workflow',
      'actions',
      'release',
      'packaging',
      'publish',
      'bundler',
      'transpile',
      'tsconfig',
      'vite',
      'webpack',
      'rollup',
      'lockfile',
      'cache',
      'cleanup',
      'housekeeping',
      'maintenance',
      'format',
      'prettier',
      'eslint',
      'lint',
    ],
  },
  weak: {
    added: [
      'allow',
      'add on',
      'hook',
      'wire',
      'default flag',
      'parameter',
      'option',
    ],
    fixed: ['mitigate', 'patch', 'guard', 'handle'],
    changed: [
      'tune',
      'retune',
      'calibrate',
      'rearrange',
      'reorganize',
      'restructure',
    ],
    docs: ['typo', 'wording', 'rename section', 'rename header'],
    chore: ['bump', 'upgrade', 'pin', 'deps', 'dependency'],
  },
  negative: [
    { keyword: 'workaround', weight: WEIGHT.negative.medium },
    { keyword: 'temporary', weight: WEIGHT.negative.medium },
    { keyword: 'hack', weight: WEIGHT.negative.medium },
    { keyword: 'wip', weight: WEIGHT.negative.strong },
    { keyword: 'experimental', weight: WEIGHT.negative.mild },
  ],
};

const SCORE_MIN = 0;
const SCORE_MAX = 12;

// Decision thresholds for selecting the best category
const BEST_CATEGORY_MIN_SCORE = 4;
const BEST_CATEGORY_REQUIRED_MARGIN = 2;

// WHY: Shared weights for weak keywords, attenuation, and combo heuristics.
const WEAK_KEYWORD_WEIGHT = 1;
const NEGATIVE_ATTENUATION_WEIGHT = 1;

// WHY: Build n-grams only for reasonably short titles to limit cost.
const NGRAM_MAX_WORDS = 50;

/**
 * Thresholds for interpreting category scores.
 * Background: Tuned to balance precision vs. recall for Fixed/Changed/Added.
 */
export const SCORE_THRESHOLDS = {
  fixed: 4,
  changed: 4,
  added: 4,
  breaking: 6,
};

// Use centralized BucketName type for section identifiers.
type SectionName = BucketName;

type ScoreDeltas = Partial<Record<SectionName, number>>;

type WeightedKeyword =
  | string
  | { readonly keyword: string; readonly weight: number };

type KeywordIndex = Map<
  string,
  Array<{ section: SectionName; weight: number }>
>;

/**
 * Add a weighted keyword entry to a keyword index.
 * @param index Keyword index being built.
 * @param section Changelog section affected by the keyword.
 * @param entry Keyword string or explicit weighted keyword.
 * @param defaultWeight Weight used for plain string entries.
 */
function addKeywordToIndex(
  index: KeywordIndex,
  section: SectionName,
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

/**
 * Build an index from grouped weighted keyword entries.
 * @param groups Section-keyword groups to index.
 * @param defaultWeight Weight used for plain string entries.
 * @returns Map from keyword phrase to section-weight pairs.
 */
function buildKeywordIndex(
  groups: Array<{
    section: SectionName;
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

// WHY: Build keyword indices once at module init time to avoid per-call allocation.
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
 * Initialize an empty score object with zero for every section.
 * @returns Fresh `CategoryScores` with all sections set to 0.
 */
function createEmptyScores(): CategoryScores {
  const categoryScores = {} as CategoryScores;
  for (const section of SECTION_ORDER) categoryScores[section] = 0;
  return categoryScores;
}

/**
 * Check whether a raw commit/title includes a breaking marker in the prefix.
 * Accepts both `type!: msg` and `type(scope)!: msg` forms.
 * @param rawTitle Original PR title or commit subject.
 * @returns True when a breaking marker is found in the prefix.
 */
function hasBreakingMarkerInPrefix(rawTitle: string): boolean {
  // Accept both `type!: msg` and `type(scope)!: msg` forms
  return BREAKING_PREFIX_MARKER_RE.test(rawTitle.split('\n')[0] || '');
}

/**
 * Add score deltas to a mutable score object.
 * @param scores Score object to mutate.
 * @param deltas Per-section deltas to apply.
 */
function addScoreDeltas(scores: CategoryScores, deltas: ScoreDeltas): void {
  for (const [sectionName, weight] of Object.entries(deltas) as Array<
    [SectionName, number]
  >) {
    scores[sectionName] += weight;
  }
}

/**
 * Generate normalized words and short n-grams for keyword matching.
 * @param normalizedTitle Title after lowercasing and normalization.
 * @returns Unique phrases eligible for keyword scoring.
 */
function createNormalizedPhrases(normalizedTitle: string): Set<string> {
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

/**
 * Score conventional prefix signals.
 * @param rawTitle Original title, preserving prefix punctuation.
 * @param lowercasedTitle Lowercased title used by prefix regexes.
 * @returns Per-section prefix score deltas.
 */
function collectPrefixFamilyDeltas(
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
 * Collect capped keyword scores for one keyword family.
 * @param normalizedPhrases Normalized words and n-grams from the title.
 * @param keywordIndex Index for the keyword family to score.
 * @returns Max matching keyword score per section.
 */
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
 * Attenuate the strongest main category when the title includes uncertainty signals.
 * @param scores Mutable scores to adjust.
 * @param normalizedPhrases Normalized words and n-grams from the title.
 */
function applyNegativeSignalAttenuation(
  scores: CategoryScores,
  normalizedPhrases: Set<string>,
): void {
  const hasNegativeSignal = CATEGORY_WEIGHTS.negative.some(({ keyword }) =>
    normalizedPhrases.has(keyword),
  );
  if (!hasNegativeSignal) return;

  const candidateSections: SectionName[] = [
    SECTION_FIXED,
    SECTION_CHANGED,
    SECTION_ADDED,
  ];
  let bestSection: SectionName | null = null;
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
 * @param normalizedTitle Normalized title used by combo regexes.
 */
function applyComboHeuristics(
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
 * Apply dependency version bump heuristics.
 * @param scores Mutable scores to adjust.
 * @param normalizedTitle Normalized title used by dependency regexes.
 */
function applyDependencyBumpHeuristic(
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
function clampScores(scores: CategoryScores): void {
  for (const section of SECTION_ORDER) {
    scores[section] = Math.max(SCORE_MIN, Math.min(SCORE_MAX, scores[section]));
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

  addScoreDeltas(scores, collectPrefixFamilyDeltas(rawTitle, lowercasedTitle));
  addScoreDeltas(
    scores,
    collectKeywordFamilyDeltas(normalizedPhrases, STRONG_KEYWORD_INDEX),
  );
  addScoreDeltas(
    scores,
    collectKeywordFamilyDeltas(normalizedPhrases, WEAK_KEYWORD_INDEX),
  );

  applyNegativeSignalAttenuation(scores, normalizedPhrases);
  applyComboHeuristics(scores, normalizedTitle);
  applyDependencyBumpHeuristic(scores, normalizedTitle);
  clampScores(scores);

  return scores;
}

/**
 * Select the best category using a minimum score and margin rule.
 * @param scores Category scores computed by `scoreCategories`.
 * @returns Best section name, or null if inconclusive.
 */
export function bestCategory(scores: CategoryScores): SectionName | null {
  let topSection: SectionName | undefined;
  let secondSection: SectionName | undefined;
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
  )
    return topSection;
  return null;
}
