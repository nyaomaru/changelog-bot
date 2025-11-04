import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import type { ReleaseItem } from '@/types/release.js';
import { isImplicitFixTitle } from '@/utils/category-tune.js';

const REFACTOR_LIKE_RE = /^(refactor|perf|style)(\(|:)/i;

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
  for (const item of items) {
    const base = (item.rawTitle ?? item.title ?? '').trim();
    if (!base) continue;

    const lower = base.toLowerCase();
    const core = base.replace(CONVENTIONAL_PREFIX_RE, '').trim();

    // If the title implies a correctness fix (e.g., typing/contract fix),
    // present it as a conventional `fix:` for the classifier.
    if (isImplicitFixTitle(base) && !/^fix(\(|:)/i.test(lower)) {
      out.push(`fix: ${core}`);
      continue;
    }

    // Normalize refactor/perf/style to refactor: for consistent Changed mapping.
    if (REFACTOR_LIKE_RE.test(lower)) {
      out.push(/^refactor(\(|:)/i.test(lower) ? base : `refactor: ${core}`);
      continue;
    }

    out.push(base);
  }
  return out;
}

