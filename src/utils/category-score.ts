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

type SectionName = (typeof SECTION_ORDER)[number];

type KeywordIndex = Map<
  string,
  Array<{ section: SectionName; weight: number }>
>;

// WHY: Build keyword indices once at module init time to avoid per-call allocation.
/**
 * Build an index of strong keywords to section/weight mappings.
 * @returns Map from keyword phrase to section-weight pairs.
 */
function buildStrongKeywordIndex(): KeywordIndex {
  const index: KeywordIndex = new Map();
  const add = (
    section: SectionName,
    entry: string | { keyword: string; weight: number },
    defaultWeight = WEIGHT.strong.default
  ) => {
    const { keyword, weight } =
      typeof entry === 'string'
        ? { keyword: entry, weight: defaultWeight }
        : entry;
    const existing = index.get(keyword) || [];
    existing.push({ section, weight });
    index.set(keyword, existing);
  };
  for (const entry of CATEGORY_WEIGHTS.strong.breaking)
    add(SECTION_BREAKING_CHANGES, entry, WEIGHT.strong.default);
  for (const entry of CATEGORY_WEIGHTS.strong.added)
    add(SECTION_ADDED, entry, WEIGHT.strong.default);
  for (const entry of CATEGORY_WEIGHTS.strong.fixed)
    add(SECTION_FIXED, entry, WEIGHT.strong.default);
  for (const entry of CATEGORY_WEIGHTS.strong.changed)
    add(SECTION_CHANGED, entry, WEIGHT.strong.default);
  for (const entry of CATEGORY_WEIGHTS.strong.docs)
    add(SECTION_DOCS, entry, WEIGHT.strong.default);
  for (const entry of CATEGORY_WEIGHTS.strong.test)
    add(SECTION_TEST, entry, WEIGHT.strong.default);
  for (const entry of CATEGORY_WEIGHTS.strong.chore)
    add(SECTION_CHORE, entry, WEIGHT.strong.default);
  return index;
}

/**
 * Build an index of weak keywords to section/weight mappings.
 * @returns Map from keyword phrase to section-weight pairs.
 */
function buildWeakKeywordIndex(): KeywordIndex {
  const index: KeywordIndex = new Map();
  const add = (section: SectionName, keyword: string) => {
    const existing = index.get(keyword) || [];
    existing.push({ section, weight: WEAK_KEYWORD_WEIGHT });
    index.set(keyword, existing);
  };
  for (const keyword of CATEGORY_WEIGHTS.weak.added)
    add(SECTION_ADDED, keyword);
  for (const keyword of CATEGORY_WEIGHTS.weak.fixed)
    add(SECTION_FIXED, keyword);
  for (const keyword of CATEGORY_WEIGHTS.weak.changed)
    add(SECTION_CHANGED, keyword);
  for (const keyword of CATEGORY_WEIGHTS.weak.docs) add(SECTION_DOCS, keyword);
  for (const keyword of CATEGORY_WEIGHTS.weak.chore)
    add(SECTION_CHORE, keyword);
  return index;
}

// Module-level caches
const STRONG_KEYWORD_INDEX: KeywordIndex = buildStrongKeywordIndex();
const WEAK_KEYWORD_INDEX: KeywordIndex = buildWeakKeywordIndex();

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
 * Compute heuristic scores per category from a raw title.
 * @param rawTitle Original PR title or commit subject.
 * @returns Scores for each CHANGELOG section.
 */
export function scoreCategories(rawTitle: string): CategoryScores {
  const scores = createEmptyScores();
  if (!rawTitle) return scores;
  const lowercasedTitle = rawTitle.toLowerCase();
  const normalizedTitle = normalizeTitle(lowercasedTitle);
  const words = normalizedTitle.split(/\s+/).filter(Boolean);
  const useNgrams = words.length <= NGRAM_MAX_WORDS;
  const biGrams: string[] = [];
  const triGrams: string[] = [];
  if (useNgrams) {
    for (let i = 0; i < words.length - 1; i++)
      biGrams.push(`${words[i]} ${words[i + 1]}`);
    for (let i = 0; i < words.length - 2; i++)
      triGrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  const normalizedPhrases = new Set<string>(
    useNgrams ? [...words, ...biGrams, ...triGrams] : words
  );

  // Prefix family
  const prefixFamilyDeltas: Partial<Record<SectionName, number>> = {};
  if (hasBreakingMarkerInPrefix(rawTitle))
    prefixFamilyDeltas[SECTION_BREAKING_CHANGES] =
      CATEGORY_WEIGHTS.prefix.breaking;
  if (FEAT_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas[SECTION_ADDED] = CATEGORY_WEIGHTS.prefix.feat;
  if (FIX_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas[SECTION_FIXED] = CATEGORY_WEIGHTS.prefix.fix;
  if (REFACTOR_PERF_STYLE_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    prefixFamilyDeltas[SECTION_CHANGED] = Math.max(
      CATEGORY_WEIGHTS.prefix.refactor,
      PERF_PREFIX_FLEX_RE.test(lowercasedTitle)
        ? CATEGORY_WEIGHTS.prefix.perf
        : CATEGORY_WEIGHTS.prefix.refactor
    );
  }
  if (DOCS_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas[SECTION_DOCS] = CATEGORY_WEIGHTS.prefix.docs;
  if (TEST_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas[SECTION_TEST] = CATEGORY_WEIGHTS.prefix.test;
  if (REVERT_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas[SECTION_REVERTED] = CATEGORY_WEIGHTS.prefix.revert;
  if (CHORE_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas[SECTION_CHORE] = CATEGORY_WEIGHTS.prefix.chore;
  for (const [sectionName, weight] of Object.entries(prefixFamilyDeltas))
    scores[sectionName as SectionName] += weight || 0;

  // Keyword indices are prebuilt once at module init time
  // Strong family accumulation with family cap per section
  const strongFamilyDeltas: Partial<Record<SectionName, number>> = {};
  for (const phrase of normalizedPhrases) {
    const keywordHits = STRONG_KEYWORD_INDEX.get(phrase);
    if (!keywordHits) continue;
    for (const { section, weight } of keywordHits) {
      strongFamilyDeltas[section] = Math.max(
        strongFamilyDeltas[section] || 0,
        weight
      );
    }
  }
  for (const [sectionName, weight] of Object.entries(strongFamilyDeltas))
    scores[sectionName as SectionName] += weight || 0;

  // Weak family accumulation with cap
  const weakFamilyDeltas: Partial<Record<SectionName, number>> = {};
  for (const phrase of normalizedPhrases) {
    const keywordHits = WEAK_KEYWORD_INDEX.get(phrase);
    if (!keywordHits) continue;
    for (const { section, weight } of keywordHits) {
      weakFamilyDeltas[section] = Math.max(
        weakFamilyDeltas[section] || 0,
        weight
      );
    }
  }
  for (const [sectionName, weight] of Object.entries(weakFamilyDeltas))
    scores[sectionName as SectionName] += weight || 0;

  // Negative signals family (attenuation applied to strongest of Fixed/Changed/Added)
  const hasNegative = CATEGORY_WEIGHTS.negative.some(({ keyword }) =>
    normalizedPhrases.has(keyword)
  );
  if (hasNegative) {
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
        0
      );
    }
  }

  // Combos (pattern-based)
  const comboText = normalizedTitle;
  if (COMBO_ADD_TO_IMPROVE_RE.test(comboText)) {
    scores[SECTION_ADDED] += WEAK_KEYWORD_WEIGHT;
    scores[SECTION_CHANGED] += WEIGHT.strong.default;
  }
  if (COMBO_TIGHTEN_TYPE_RE.test(comboText)) {
    scores[SECTION_FIXED] += WEIGHT.strong.default;
    scores[SECTION_CHANGED] += WEAK_KEYWORD_WEIGHT;
  }
  if (COMBO_FIX_BY_ADDING_RE.test(comboText)) {
    scores[SECTION_FIXED] += WEIGHT.strong.default;
    scores[SECTION_ADDED] += WEAK_KEYWORD_WEIGHT;
  }
  if (COMBO_REMOVE_WITHOUT_REPLACEMENT_RE.test(comboText)) {
    scores[SECTION_BREAKING_CHANGES] += WEIGHT.strong.high;
    scores[SECTION_CHANGED] += WEAK_KEYWORD_WEIGHT;
  }

  // Dependency major bump heuristic (e.g., bump X from 1 to 2)
  const hasBumpOrUpgradeKeyword = BUMP_OR_UPGRADE_RE.test(comboText);
  if (hasBumpOrUpgradeKeyword) {
    scores[SECTION_CHORE] += WEIGHT_LEVEL.low;
    const versionRangeMatch = comboText.match(VERSION_FROM_TO_RE);
    if (versionRangeMatch) {
      const from = parseInt(versionRangeMatch[1], 10);
      const to = parseInt(versionRangeMatch[2], 10);
      if (!Number.isNaN(from) && !Number.isNaN(to) && to > from) {
        scores[SECTION_BREAKING_CHANGES] += WEIGHT_LEVEL.low;
        scores[SECTION_CHANGED] += WEAK_KEYWORD_WEIGHT;
      }
    }
  }

  // Clamp totals
  for (const section of SECTION_ORDER) {
    scores[section] = Math.max(SCORE_MIN, Math.min(SCORE_MAX, scores[section]));
  }
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
