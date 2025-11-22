import { SECTION_ORDER } from '@/constants/changelog.js';
import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import type { CategoryScores } from '@/types/changelog.js';
import { normalizeTitle } from '@/utils/title-normalize.js';

// WHY: Keep weights deterministic and simple. Phase 2 can load overrides.
// Default weights used by the scoring heuristic.
const CATEGORY_WEIGHTS = {
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
    // build/ci contribute to chore via keywords, not separate section
  },
  strong: {
    breaking: [
      { kw: 'breaking change', w: 5 },
      { kw: 'incompatible', w: 4 },
      { kw: 'remove support', w: 4 },
      { kw: 'drop support', w: 4 },
      { kw: 'deprecate', w: 3 },
      { kw: 'removal', w: 3 },
      { kw: 'api change', w: 3 },
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
      'opt-in',
      'integrate',
    ],
    fixed: [
      { kw: 'regression', w: 4 },
      { kw: 'crash', w: 4 },
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
      { kw: 'security', w: 4 },
      { kw: 'vuln', w: 4 },
      { kw: 'cve', w: 5 },
      { kw: 'xss', w: 5 },
      { kw: 'csrf', w: 5 },
      { kw: 'rce', w: 5 },
      { kw: 'dos', w: 5 },
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
      'fine-tune',
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
      'add-on',
      'hook',
      'wire',
      'default flag',
      'parameter',
      'option',
      'expose',
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
    { kw: 'workaround', w: -2 },
    { kw: 'temporary', w: -2 },
    { kw: 'hack', w: -2 },
    { kw: 'wip', w: -3 },
    { kw: 'experimental', w: -1 },
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
  return /!:\s*/.test(rawTitle.split('\n')[0] || '');
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
  const biGrams: string[] = [];
  const triGrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++)
    biGrams.push(`${words[i]} ${words[i + 1]}`);
  for (let i = 0; i < words.length - 2; i++)
    triGrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  const normalizedPhrases = new Set<string>([
    ...words,
    ...biGrams,
    ...triGrams,
  ]);

  // Prefix family
  const prefixFamilyDeltas: Partial<Record<SectionName, number>> = {};
  if (hasBreakingMarkerInPrefix(rawTitle))
    prefixFamilyDeltas['Breaking Changes'] = CATEGORY_WEIGHTS.prefix.breaking;
  if (/^feat(\(|:)/i.test(lowercasedTitle))
    prefixFamilyDeltas.Added = CATEGORY_WEIGHTS.prefix.feat;
  if (/^fix(\(|:)/i.test(lowercasedTitle))
    prefixFamilyDeltas.Fixed = CATEGORY_WEIGHTS.prefix.fix;
  if (/^(refactor|perf|style)(\(|:)/i.test(lowercasedTitle)) {
    prefixFamilyDeltas.Changed = Math.max(
      CATEGORY_WEIGHTS.prefix.refactor,
      /^(perf)(\(|:)/i.test(lowercasedTitle)
        ? CATEGORY_WEIGHTS.prefix.perf
        : CATEGORY_WEIGHTS.prefix.refactor
    );
  }
  if (/^docs(\(|:)/i.test(lowercasedTitle))
    prefixFamilyDeltas.Docs = CATEGORY_WEIGHTS.prefix.docs;
  if (/^test(\(|:)/i.test(lowercasedTitle))
    prefixFamilyDeltas.Test = CATEGORY_WEIGHTS.prefix.test;
  if (/^revert(\(|:)/i.test(lowercasedTitle))
    prefixFamilyDeltas.Reverted = CATEGORY_WEIGHTS.prefix.revert;
  if (/^chore(\(|:)/i.test(lowercasedTitle))
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
      entry: string | { kw: string; w: number },
      defaultWeight = 3
    ) => {
      const { kw, w } =
        typeof entry === 'string' ? { kw: entry, w: defaultWeight } : entry;
      const list = index.get(kw) || [];
      list.push({ section, weight: w });
      index.set(kw, list);
    };
    for (const e of CATEGORY_WEIGHTS.strong.breaking)
      add('Breaking Changes', e, 3);
    for (const e of CATEGORY_WEIGHTS.strong.added) add('Added', e, 3);
    for (const e of CATEGORY_WEIGHTS.strong.fixed) add('Fixed', e, 3);
    for (const e of CATEGORY_WEIGHTS.strong.changed) add('Changed', e, 3);
    for (const e of CATEGORY_WEIGHTS.strong.docs) add('Docs', e, 3);
    for (const e of CATEGORY_WEIGHTS.strong.test) add('Test', e, 3);
    for (const e of CATEGORY_WEIGHTS.strong.chore) add('Chore', e, 3);
    return index;
  }
  function buildWeakKeywordIndex() {
    const index = new Map<
      string,
      Array<{ section: SectionName; weight: number }>
    >();
    const add = (section: SectionName, keyword: string) => {
      const list = index.get(keyword) || [];
      list.push({ section, weight: 1 });
      index.set(keyword, list);
    };
    for (const e of CATEGORY_WEIGHTS.weak.added) add('Added', e);
    for (const e of CATEGORY_WEIGHTS.weak.fixed) add('Fixed', e);
    for (const e of CATEGORY_WEIGHTS.weak.changed) add('Changed', e);
    for (const e of CATEGORY_WEIGHTS.weak.docs) add('Docs', e);
    for (const e of CATEGORY_WEIGHTS.weak.chore) add('Chore', e);
    return index;
  }
  // Module-level caches for keyword indices
  let strongKeywordIndex: Map<
    string,
    Array<{ section: SectionName; weight: number }>
  > | null = null;
  let weakKeywordIndex: Map<
    string,
    Array<{ section: SectionName; weight: number }>
  > | null = null;
  if (!strongKeywordIndex) {
    strongKeywordIndex = buildStrongKeywordIndex();
  }
  if (!weakKeywordIndex) {
    weakKeywordIndex = buildWeakKeywordIndex();
  }
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
  const hasNegative = CATEGORY_WEIGHTS.negative.some(({ kw }) =>
    normalizedPhrases.has(kw)
  );
  if (hasNegative) {
    const strongest: SectionName[] = ['Fixed', 'Changed', 'Added'];
    let best: SectionName | null = null;
    let bestVal = -Infinity;
    for (const s of strongest) {
      if (scores[s] > bestVal) {
        bestVal = scores[s];
        best = s;
      }
    }
    if (best) scores[best] = Math.max(scores[best] - 1, 0);
  }

  // Combos (pattern-based)
  const comboText = normalizedTitle;
  if (/add .* to (improve|optimiz|refine|streamline|simplif)/.test(comboText)) {
    scores.Added += 1;
    scores.Changed += 3;
  }
  if (/(tighten|narrow).* (type|contract)/.test(comboText)) {
    scores.Fixed += 3;
    scores.Changed += 1;
  }
  if (/fix .* by add(ing)?/.test(comboText)) {
    scores.Fixed += 3;
    scores.Added += 1;
  }
  if (/remove .* (without|no) (replacement|fallback)/.test(comboText)) {
    scores['Breaking Changes'] += 4;
    scores.Changed += 1;
  }

  // Dependency major bump heuristic (e.g., bump X from 1 to 2)
  const hasBumpOrUpgradeKeyword = /bump|upgrade/.test(comboText);
  if (hasBumpOrUpgradeKeyword) {
    scores.Chore += 2;
    const versionRangeMatch = comboText.match(/from\s+(\d+)\b.*to\s+(\d+)\b/);
    if (versionRangeMatch) {
      const from = parseInt(versionRangeMatch[1], 10);
      const to = parseInt(versionRangeMatch[2], 10);
      if (
        !Number.isNaN(from) &&
        !Number.isNaN(to) &&
        to > from &&
        to - from >= 1
      ) {
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
    if (
      topSection === null ||
      scores[section] > (topSection ? scores[topSection] : -Infinity)
    ) {
      secondSection = topSection;
      topSection = section;
    } else if (
      secondSection === null ||
      scores[section] > (secondSection ? scores[secondSection] : -Infinity)
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
