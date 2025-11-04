import { CONVENTIONAL_PREFIX_RE, REFACTOR_LIKE_RE } from '@/constants/conventional.js';
import type { CategoryMap } from '@/types/changelog.js';
import type { ReleaseItem } from '@/types/release.js';

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

  const mentionsType = typeIndicators.some((kw) => core.includes(kw));
  const impliesFix = fixIndicators.some((kw) => core.includes(kw));

  // If the core mentions typing/contract and implies a correction, treat as Fixed.
  if (mentionsType && impliesFix) return true;

  // Additional conservative pattern: "narrow type" / "tighten type" without explicit fix word.
  if (mentionsType && (core.includes('narrow') || core.includes('tighten'))) {
    return true;
  }

  return false;
}

/**
 * Re-map category assignments so that titles implying a fix (e.g., type tightening) land in `Fixed`.
 * @param items Parsed release items (with rawTitle/title values).
 * @param categories Category mapping produced by the classifier.
 * @returns Adjusted CategoryMap with qualifying titles moved to `Fixed`.
 */
export function tuneCategoriesByTitle(
  items: ReleaseItem[],
  categories: CategoryMap
): CategoryMap {
  if (!items.length) return categories;

  // Build lookup for quick access to the raw/original title used by the classifier output.
  const knownTitles = new Set<string>();
  for (const item of items) {
    if (item.rawTitle) knownTitles.add(item.rawTitle);
    knownTitles.add(item.title);
  }

  // Ensure Fixed/Changed buckets exist on a deep-copied map so we don't mutate inputs.
  const adjusted: CategoryMap = Object.fromEntries(
    Object.entries(categories).map(([section, list]) => [
      section,
      Array.isArray(list) ? list.slice() : [],
    ])
  );
  if (!adjusted.Fixed) adjusted.Fixed = [];
  if (!adjusted.Changed) adjusted.Changed = [];

  // Collect titles that should be moved.
  const toMove: string[] = [];
  for (const title of knownTitles) {
    if (isImplicitFixTitle(title)) toMove.push(title);
  }
  if (!toMove.length) return adjusted;

  // Remove from any existing buckets and add to Fixed, ensuring uniqueness.
  for (const title of toMove) {
    for (const list of Object.values(adjusted)) {
      if (!Array.isArray(list)) continue;
      const idx = list.indexOf(title);
      if (idx !== -1) list.splice(idx, 1);
    }
    if (!adjusted.Fixed.includes(title)) adjusted.Fixed.push(title);
  }

  // Secondary rule: refactor/perf/style-like items should land in Changed when misclassified as Chore or missing.
  const isRefactorLike = (raw: string) => REFACTOR_LIKE_RE.test(raw.toLowerCase());

  // Helper to find current category of a title.
  const findCategory = (title: string): string | undefined => {
    for (const [section, list] of Object.entries(adjusted)) {
      if (Array.isArray(list) && list.includes(title)) return section;
    }
    return undefined;
  };

  for (const title of knownTitles) {
    if (!isRefactorLike(title)) continue;
    const current = findCategory(title);
    if (current === 'Fixed') continue; // don't override explicit/implicit fixes
    if (current && current !== 'Chore') continue; // already in a non-Chore bucket
    // Remove from all and move to Changed
    for (const list of Object.values(adjusted)) {
      if (!Array.isArray(list)) continue;
      const idx = list.indexOf(title);
      if (idx !== -1) list.splice(idx, 1);
    }
    if (!adjusted.Changed.includes(title)) adjusted.Changed.push(title);
  }

  return adjusted;
}
