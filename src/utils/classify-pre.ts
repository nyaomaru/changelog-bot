import {
  CONVENTIONAL_PREFIX_RE,
  REFACTOR_LIKE_RE,
  FIX_PREFIX_FLEX_RE,
  REFACTOR_PERF_STYLE_PREFIX_FLEX_RE,
  FEAT_PREFIX_FLEX_RE,
} from '@/constants/conventional.js';
import type { ClassificationChange } from '@/types/changelog.js';
import type { ReleaseChange } from '@/types/release.js';
import {
  isImplicitFixTitle,
  isChangeLikeTitle,
} from '@/utils/category-tune.js';
import { bestCategory, scoreCategories } from '@/utils/category-score.js';
import {
  SECTION_ADDED,
  SECTION_CHANGED,
  SECTION_FIXED,
} from '@/constants/changelog.js';

/**
 * Normalize change titles for classification without changing their IDs or
 * final rendered titles.
 *
 * Rules:
 * - Implicit type corrections → prefix with `fix:`
 * - Refactor/perf/style-like → ensure `refactor:` prefix
 * - Otherwise, keep the original raw title when available
 * @param items Canonical release changes to prepare for classification.
 * @returns Stable IDs paired with normalized classification titles.
 */
export function buildChangesForClassification(
  items: ReleaseChange[],
): ClassificationChange[] {
  const changes: ClassificationChange[] = [];
  // Use flexible conventional-prefix regexes to support scope and breaking markers.
  for (const item of items) {
    const base = (item.rawTitle ?? item.title ?? '').trim();
    const lower = base.toLowerCase();
    const core = base.replace(CONVENTIONAL_PREFIX_RE, '').trim();
    let title = base;

    // If the title implies a correctness fix (e.g., typing/contract fix),
    // present it as a conventional `fix:` for the classifier.
    if (isImplicitFixTitle(base) && !FIX_PREFIX_FLEX_RE.test(lower)) {
      title = `fix: ${core}`;
    } else if (REFACTOR_LIKE_RE.test(lower)) {
      // Normalize refactor/perf/style to refactor: for consistent Changed mapping.
      title = REFACTOR_PERF_STYLE_PREFIX_FLEX_RE.test(lower)
        ? base
        : `refactor: ${core}`;
    } else if (isChangeLikeTitle(base)) {
      // Nudge change-like improvements toward Changed by presenting as refactor.
      title = REFACTOR_PERF_STYLE_PREFIX_FLEX_RE.test(lower)
        ? base
        : `refactor: ${core}`;
    } else {
      // Scoring-guided normalization when no earlier rule matched.
      const scores = scoreCategories(base);
      const guide = bestCategory(scores);
      if (guide === SECTION_FIXED && !FIX_PREFIX_FLEX_RE.test(lower)) {
        title = `fix: ${core}`;
      } else if (
        guide === SECTION_CHANGED &&
        !REFACTOR_PERF_STYLE_PREFIX_FLEX_RE.test(lower)
      ) {
        title = `refactor: ${core}`;
      } else if (guide === SECTION_ADDED && !FEAT_PREFIX_FLEX_RE.test(lower)) {
        title = `feat: ${core}`;
      }
    }

    changes.push({ id: item.id, title });
  }
  return changes;
}
