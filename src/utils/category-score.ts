import { SECTION_ORDER } from '@/constants/changelog.js';
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

// WHY: Keep weights deterministic and self-descriptive (no magic numbers).
const WEIGHT = {
  prefix: {
    breaking: 5,
    feat: 4,
    fix: 4,
    refactor: 3,
    perf: 3,
    style: 2,
    docs: 3,
    test: 3,
    revert: 4,
    chore: 2,
  },
  strong: {
    default: 3,
    high: 4,
    veryHigh: 5,
  },
  negative: {
    mild: -1,
    medium: -2,
    strong: -3,
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

// Thresholds used by tuning (documented in plan.md). Exported for reuse if needed.
export const SCORE_THRESHOLDS = {
  fixed: 4,
  changed: 4,
  added: 4,
  breaking: 6,
};

type SectionName = (typeof SECTION_ORDER)[number];

function createEmptyScores(): CategoryScores {
  const categoryScores = {} as CategoryScores;
  for (const section of SECTION_ORDER) categoryScores[section] = 0;
  return categoryScores;
}

function hasBreakingMarkerInPrefix(rawTitle: string): boolean {
  // Accept both `type!: msg` and `type(scope)!: msg` forms
  return BREAKING_PREFIX_MARKER_RE.test(rawTitle.split('\n')[0] || '');
}

/**
 * Compute heuristic scores per category from a raw title.
 */
export function scoreCategories(rawTitle: string): CategoryScores {
  const scores = createEmptyScores();
  if (!rawTitle) return scores;
  const lowercasedTitle = rawTitle.toLowerCase();
  const normalizedTitle = normalizeTitle(lowercasedTitle);
  const words = normalizedTitle.split(/\s+/).filter(Boolean);
  const useNgrams = words.length <= 50;
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
    prefixFamilyDeltas['Breaking Changes'] = CATEGORY_WEIGHTS.prefix.breaking;
  if (FEAT_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas.Added = CATEGORY_WEIGHTS.prefix.feat;
  if (FIX_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas.Fixed = CATEGORY_WEIGHTS.prefix.fix;
  if (REFACTOR_PERF_STYLE_PREFIX_FLEX_RE.test(lowercasedTitle)) {
    prefixFamilyDeltas.Changed = Math.max(
      CATEGORY_WEIGHTS.prefix.refactor,
      /^(perf)(?:!:|(?:\([^)]*\))?!?:)/i.test(lowercasedTitle)
        ? CATEGORY_WEIGHTS.prefix.perf
        : CATEGORY_WEIGHTS.prefix.refactor
    );
  }
  if (DOCS_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas.Docs = CATEGORY_WEIGHTS.prefix.docs;
  if (TEST_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas.Test = CATEGORY_WEIGHTS.prefix.test;
  if (REVERT_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas.Reverted = CATEGORY_WEIGHTS.prefix.revert;
  if (CHORE_PREFIX_FLEX_RE.test(lowercasedTitle))
    prefixFamilyDeltas.Chore = CATEGORY_WEIGHTS.prefix.chore;
  for (const [sectionName, weight] of Object.entries(prefixFamilyDeltas))
    scores[sectionName as SectionName] += weight || 0;

  // Build hash maps for strong/weak keywords at module init time (simple closure cache)
  function buildStrongKeywordIndex() {
    const index = new Map<
      string,
      Array<{ section: SectionName; weight: number }>
    >();
    const add = (
      section: SectionName,
      entry: string | { keyword: string; weight: number } | { kw: string; w: number },
      defaultWeight = WEIGHT.strong.default
    ) => {
      // Normalize entry into semantic fields for readability and backward-compat
      const { keyword, weight } =
        typeof entry === 'string'
          ? { keyword: entry, weight: defaultWeight }
          : 'keyword' in entry
          ? (entry as { keyword: string; weight: number })
          : { keyword: (entry as any).kw, weight: (entry as any).w };
      const existing = index.get(keyword) || [];
      existing.push({ section, weight });
      index.set(keyword, existing);
    };
    for (const entry of CATEGORY_WEIGHTS.strong.breaking)
      add('Breaking Changes', entry, WEIGHT.strong.default);
    for (const entry of CATEGORY_WEIGHTS.strong.added)
      add('Added', entry, WEIGHT.strong.default);
    for (const entry of CATEGORY_WEIGHTS.strong.fixed)
      add('Fixed', entry, WEIGHT.strong.default);
    for (const entry of CATEGORY_WEIGHTS.strong.changed)
      add('Changed', entry, WEIGHT.strong.default);
    for (const entry of CATEGORY_WEIGHTS.strong.docs)
      add('Docs', entry, WEIGHT.strong.default);
    for (const entry of CATEGORY_WEIGHTS.strong.test)
      add('Test', entry, WEIGHT.strong.default);
    for (const entry of CATEGORY_WEIGHTS.strong.chore)
      add('Chore', entry, WEIGHT.strong.default);
    return index;
  }
  function buildWeakKeywordIndex() {
    const index = new Map<
      string,
      Array<{ section: SectionName; weight: number }>
    >();
    const add = (section: SectionName, keyword: string) => {
      const existing = index.get(keyword) || [];
      existing.push({ section, weight: 1 });
      index.set(keyword, existing);
    };
    for (const keyword of CATEGORY_WEIGHTS.weak.added) add('Added', keyword);
    for (const keyword of CATEGORY_WEIGHTS.weak.fixed) add('Fixed', keyword);
    for (const keyword of CATEGORY_WEIGHTS.weak.changed)
      add('Changed', keyword);
    for (const keyword of CATEGORY_WEIGHTS.weak.docs) add('Docs', keyword);
    for (const keyword of CATEGORY_WEIGHTS.weak.chore) add('Chore', keyword);
    return index;
  }
  // Module-level caches for keyword indices
  const strongKeywordIndex: Map<
    string,
    Array<{ section: SectionName; weight: number }>
  > = buildStrongKeywordIndex();
  const weakKeywordIndex: Map<
    string,
    Array<{ section: SectionName; weight: number }>
  > = buildWeakKeywordIndex();
  // Strong family accumulation with family cap per section
  const strongFamilyDeltas: Partial<Record<SectionName, number>> = {};
  for (const phrase of normalizedPhrases) {
    const keywordHits = strongKeywordIndex.get(phrase);
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
    const keywordHits = weakKeywordIndex.get(phrase);
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
    const candidateSections: SectionName[] = ['Fixed', 'Changed', 'Added'];
    let bestSection: SectionName | null = null;
    let bestScore = -Infinity;
    for (const section of candidateSections) {
      if (scores[section] > bestScore) {
        bestScore = scores[section];
        bestSection = section;
      }
    }
    if (bestSection) {
      scores[bestSection] = Math.max(scores[bestSection] - 1, 0);
    }
  }

  // Combos (pattern-based)
  const comboText = normalizedTitle;
  if (COMBO_ADD_TO_IMPROVE_RE.test(comboText)) {
    scores.Added += 1;
    scores.Changed += 3;
  }
  if (COMBO_TIGHTEN_TYPE_RE.test(comboText)) {
    scores.Fixed += 3;
    scores.Changed += 1;
  }
  if (COMBO_FIX_BY_ADDING_RE.test(comboText)) {
    scores.Fixed += 3;
    scores.Added += 1;
  }
  if (COMBO_REMOVE_WITHOUT_REPLACEMENT_RE.test(comboText)) {
    scores['Breaking Changes'] += 4;
    scores.Changed += 1;
  }

  // Dependency major bump heuristic (e.g., bump X from 1 to 2)
  const hasBumpOrUpgradeKeyword = BUMP_OR_UPGRADE_RE.test(comboText);
  if (hasBumpOrUpgradeKeyword) {
    scores.Chore += 2;
    const versionRangeMatch = comboText.match(VERSION_FROM_TO_RE);
    if (versionRangeMatch) {
      const from = parseInt(versionRangeMatch[1], 10);
      const to = parseInt(versionRangeMatch[2], 10);
      if (!Number.isNaN(from) && !Number.isNaN(to) && to > from) {
        scores['Breaking Changes'] += 2;
        scores.Changed += 1;
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
 * Select the best category with a margin rule. Returns null when inconclusive.
 */
export function bestCategory(scores: CategoryScores): SectionName | null {
  let topSection: SectionName | null = null;
  let secondSection: SectionName | null = null;
  for (const section of SECTION_ORDER) {
    if (topSection === null || scores[section] > scores[topSection]) {
      secondSection = topSection;
      topSection = section;
    } else if (
      secondSection === null ||
      scores[section] > scores[secondSection]
    ) {
      secondSection = section;
    }
  }
  if (!topSection) return null;
  const topScore = scores[topSection];
  const secondScore = secondSection ? scores[secondSection] : 0;
  if (topScore >= 4 && topScore - secondScore >= 2) return topSection;
  return null;
}
