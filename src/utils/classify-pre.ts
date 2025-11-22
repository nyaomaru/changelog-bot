import { CONVENTIONAL_PREFIX_RE, REFACTOR_LIKE_RE } from '@/constants/conventional.js';
import type { ReleaseItem } from '@/types/release.js';
import { isImplicitFixTitle, isChangeLikeTitle } from '@/utils/category-tune.js';
import { bestCategory, scoreCategories } from '@/utils/category-score.js';


/**
 * Normalize titles to make LLM classification more deterministic without
 * affecting the final rendered titles. We only change the conventional
 * prefix for the classifier input; later lookup strips it.
 *
 * Rules:
 * - Implicit type corrections → prefix with `fix:`
 * - Refactor/perf/style-like → ensure `refactor:` prefix
 * - Otherwise, keep the original raw title when available
 */
export function buildTitlesForClassification(items: ReleaseItem[]): string[] {
  const out: string[] = [];
  const FIX_PREFIX_RE = /^fix(\(|:)/i;
  const REFACTOR_PREFIX_RE = /^refactor(\(|:)/i;
  for (const item of items) {
    const base = (item.rawTitle ?? item.title ?? '').trim();
    if (!base) continue;

    const lower = base.toLowerCase();
    const core = base.replace(CONVENTIONAL_PREFIX_RE, '').trim();

    // If the title implies a correctness fix (e.g., typing/contract fix),
    // present it as a conventional `fix:` for the classifier.
    if (isImplicitFixTitle(base) && !FIX_PREFIX_RE.test(lower)) {
      out.push(`fix: ${core}`);
      continue;
    }

    // Normalize refactor/perf/style to refactor: for consistent Changed mapping.
    if (REFACTOR_LIKE_RE.test(lower)) {
      out.push(REFACTOR_PREFIX_RE.test(lower) ? base : `refactor: ${core}`);
      continue;
    }

    // Nudge change-like improvements toward Changed by presenting as refactor.
    if (isChangeLikeTitle(base)) {
      out.push(REFACTOR_PREFIX_RE.test(lower) ? base : `refactor: ${core}`);
      continue;
    }

    // Scoring-guided normalization when no earlier rule matched
    const scores = scoreCategories(base);
    const guide = bestCategory(scores);
    if (guide === 'Fixed' && !FIX_PREFIX_RE.test(lower)) {
      out.push(`fix: ${core}`);
      continue;
    }
    if (guide === 'Changed' && !REFACTOR_PREFIX_RE.test(lower)) {
      out.push(`refactor: ${core}`);
      continue;
    }
    if (guide === 'Added' && !/^feat(\(|:)/i.test(lower)) {
      out.push(`feat: ${core}`);
      continue;
    }

    out.push(base);
  }
  return out;
}
