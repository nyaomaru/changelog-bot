import {
  CONVENTIONAL_PREFIX_RE,
  REFACTOR_LIKE_RE,
} from '@/constants/conventional.js';
import type { CategoryMap } from '@/types/changelog.js';
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
import { isBucketName } from '@/utils/is.js';
import type { BucketName } from '@/types/changelog.js';

/**
 * Move given titles to a target category on a mutable CategoryMap.
 * - Removes titles from all buckets first to avoid duplicates.
 * - Ensures the target bucket exists and appends uniquely.
 */
function moveTitlesToCategory(
  adjusted: CategoryMap,
  titles: string[],
  targetCategory: string,
): void {
  if (!Array.isArray(adjusted[targetCategory])) adjusted[targetCategory] = [];
  const target = adjusted[targetCategory];
  for (const title of titles) {
    for (const list of Object.values(adjusted)) {
      if (!Array.isArray(list)) continue;
      const idx = list.indexOf(title);
      if (idx !== -1) list.splice(idx, 1);
    }
    if (!target.includes(title)) target.push(title);
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
  const lower = rawTitle.toLowerCase();

  // Strip conventional prefix to focus on the semantic core.
  const core = lower.replace(CONVENTIONAL_PREFIX_RE, '').trim();

  // Keywords indicating typing/contract corrections.
  const typeIndicators = [
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

  // Verbs/adjectives that suggest a correctness fix rather than pure refactor.
  const fixIndicators = [
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

  const mentionsType = typeIndicators.some((keyword) => core.includes(keyword));
  const impliesFix = fixIndicators.some((keyword) => core.includes(keyword));

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
  const lower = rawTitle.toLowerCase();
  const core = lower.replace(CONVENTIONAL_PREFIX_RE, '').trim();

  // Keywords indicating general improvements/behavior changes (domain-agnostic).
  // Avoid overly broad terms like "update/change" to reduce false positives.
  const changeIndicators = [
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

  return changeIndicators.some((kw) => core.includes(kw));
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

  // Build lookup for quick access to the raw/original title used by the classifier output.
  const knownTitles = new Set<string>();
  for (const item of items) {
    if (item.rawTitle) knownTitles.add(item.rawTitle);
    knownTitles.add(item.title);
  }
  // Also add all titles from the classifier output (categories) to ensure remapping works for modified titles.
  for (const list of Object.values(categories)) {
    if (Array.isArray(list)) {
      for (const title of list) {
        knownTitles.add(title);
      }
    }
  }
  // Ensure Fixed/Changed buckets exist on a deep-copied map so we don't mutate inputs.
  const adjusted: CategoryMap = Object.fromEntries(
    Object.entries(categories).map(([section, list]) => [
      section,
      Array.isArray(list) ? list.slice() : [],
    ]),
  );
  if (!adjusted[SECTION_FIXED]) adjusted[SECTION_FIXED] = [];
  if (!adjusted[SECTION_CHANGED]) adjusted[SECTION_CHANGED] = [];
  if (!adjusted[SECTION_ADDED]) adjusted[SECTION_ADDED] = [];

  // Collect titles that should be moved.
  const toMove: string[] = [];
  for (const title of knownTitles) {
    if (isImplicitFixTitle(title)) toMove.push(title);
  }

  // Remove from any existing buckets and add to Fixed, ensuring uniqueness.
  if (toMove.length) moveTitlesToCategory(adjusted, toMove, SECTION_FIXED);

  // Rule: Conventional `fix:` prefix should map to Fixed (guard against LLM misclassifying as Chore).
  // Match conventional fix prefixes including optional scope and optional breaking '!'
  // Examples: fix: msg, fix!: msg, fix(scope): msg, fix(scope)!: msg
  const FIX_PREFIX_RE = /^fix(?:!:|(?:\([^)]*\))?!?:)/i;
  const conventionalFixes: string[] = [];
  for (const title of knownTitles) {
    if (FIX_PREFIX_RE.test(title)) conventionalFixes.push(title);
  }
  if (conventionalFixes.length)
    moveTitlesToCategory(adjusted, conventionalFixes, SECTION_FIXED);

  // Secondary rule: refactor/perf/style-like items should land in Changed when misclassified as Chore or missing.
  const isRefactorLike = (raw: string) =>
    REFACTOR_LIKE_RE.test(raw.toLowerCase());
  const isChangeLike = (raw: string) => isChangeLikeTitle(raw);

  // Helper to find current category of a title.
  const findCategory = (title: string): BucketName | undefined => {
    for (const [section, list] of Object.entries(adjusted)) {
      if (Array.isArray(list) && list.includes(title) && isBucketName(section))
        return section;
    }
    return undefined;
  };

  const toChanged: string[] = [];
  for (const title of knownTitles) {
    if (!isRefactorLike(title) && !isChangeLike(title)) continue;
    const current = findCategory(title);
    if (current === SECTION_FIXED) continue; // don't override explicit/implicit fixes
    if (current && current !== SECTION_CHORE && current !== SECTION_ADDED)
      continue; // already in a specific bucket
    toChanged.push(title);
  }
  if (toChanged.length)
    moveTitlesToCategory(adjusted, toChanged, SECTION_CHANGED);

  // Rule: Conventional `feat:` prefix should map to Added (guard against LLM
  // placing features under Chore/Changed due to generic verbs like "add/support").
  // Match conventional feat prefixes including optional scope and optional breaking '!'
  // Examples: feat: msg, feat!: msg, feat(scope): msg, feat(scope)!: msg
  const FEAT_PREFIX_RE = /^feat(?:!:|(?:\([^)]*\))?!?:)/i;
  const toAdded: string[] = [];
  for (const title of knownTitles) {
    if (FEAT_PREFIX_RE.test(title)) toAdded.push(title);
  }
  if (toAdded.length) moveTitlesToCategory(adjusted, toAdded, SECTION_ADDED);

  // Scoring-based remap from weak buckets when confident
  const WEAK_BUCKETS = new Set<BucketName>([
    SECTION_CHORE,
    SECTION_DOCS,
    SECTION_TEST,
  ]);
  for (const title of knownTitles) {
    const current = findCategory(title);
    if (!current || !WEAK_BUCKETS.has(current)) continue;
    const scores = scoreCategories(title);
    const guide = bestCategory(scores);
    if (
      guide === SECTION_FIXED &&
      scores[SECTION_FIXED] >= SCORE_THRESHOLDS.fixed
    ) {
      moveTitlesToCategory(adjusted, [title], SECTION_FIXED);
      continue;
    }
    if (
      guide === SECTION_CHANGED &&
      scores[SECTION_CHANGED] >= SCORE_THRESHOLDS.changed
    ) {
      moveTitlesToCategory(adjusted, [title], SECTION_CHANGED);
      continue;
    }
    if (
      guide === SECTION_ADDED &&
      scores[SECTION_ADDED] >= SCORE_THRESHOLDS.added
    ) {
      moveTitlesToCategory(adjusted, [title], SECTION_ADDED);
      continue;
    }
    if (
      guide === SECTION_BREAKING_CHANGES &&
      scores[SECTION_BREAKING_CHANGES] >= SCORE_THRESHOLDS.breaking
    ) {
      // Only elevate to Breaking when very confident
      moveTitlesToCategory(adjusted, [title], SECTION_BREAKING_CHANGES);
      continue;
    }
  }

  return adjusted;
}
