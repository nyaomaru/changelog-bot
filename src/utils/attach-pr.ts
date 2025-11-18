// WHY: We normalize titles for fuzzy matching, so we strip any leading
// conventional commit prefix (with optional scope) to compare plain subjects.
import { isBulletLine } from '@/utils/is.js';
import { INLINE_PR_PRESENT_RE } from '@/constants/conventional.js';
import { normalizeTitle } from '@/utils/title-normalize.js';

/** Maps original PR titles to their numeric identifiers. */
type TitleToPr = Record<string, number>;

type BulletParts = {
  /** Leading bullet marker including whitespace (e.g., "- "). */
  prefix: string;
  /** Bullet content without the leading marker. */
  text: string;
};

/**
 * Normalize bullet titles for fuzzy matching by lowercasing and stripping punctuation.
 * @param rawTitle Original bullet text.
 * @returns Normalized key for lookups.
 */
// title normalization moved to shared util: normalizeTitle

/**
 * Check whether a line already includes an inline PR reference (e.g., "(#123)").
 * @param line Markdown line to inspect.
 */
function hasInlinePrReference(line: string): boolean {
  // Common patterns: "(#123)" or "[#123]" (including markdown links like in [#123](...))
  return INLINE_PR_PRESENT_RE.test(line);
}

/**
 * Build a map keyed by normalized titles for efficient fuzzy matching.
 * @param titleToPr Original title-to-PR map.
 * @returns Map keyed by normalized titles.
 */
function buildNormalizedLookup(titleToPr: TitleToPr): Map<string, number> {
  const normalized = new Map<string, number>();
  for (const [originalTitle, prNumber] of Object.entries(titleToPr)) {
    const key = normalizeTitle(originalTitle);
    if (normalized.has(key)) {
      const existing = normalized.get(key)!;
      // WHY: Collisions happen when titles differ only by punctuation/case.
      // Prefer the higher PR number (usually newer) and log for visibility.
      if (prNumber !== existing) {
        // eslint-disable-next-line no-console
        console.warn(
          `Title collision: "${originalTitle}" -> "${key}" (PR #${prNumber} vs #${existing})`
        );
      }
      normalized.set(key, Math.max(existing, prNumber));
    } else {
      normalized.set(key, prNumber);
    }
  }
  return normalized;
}

/**
 * Split a markdown bullet line into prefix ("- ") and text segments.
 * @param line Markdown line to split.
 * @returns Bullet fragments or `undefined` when the line is not a bullet.
 */
function splitBulletLine(line: string): BulletParts | undefined {
  const bulletMatch = line.match(/^(\s*[-*]\s+)(.*)$/);
  if (!bulletMatch) return undefined;
  const [, prefix, text] = bulletMatch;
  return { prefix, text };
}

/**
 * Find a PR number whose normalized title matches the bullet text (prefix matching both ways).
 * @param normalizedBulletText Normalized bullet content.
 * @param normalizedTitleToPr Map of normalized titles to PR numbers.
 * @returns Matching PR number when found.
 */
function findMatchingPrNumber(
  normalizedBulletText: string,
  normalizedTitleToPr: Map<string, number>
): number | undefined {
  const direct = normalizedTitleToPr.get(normalizedBulletText);
  if (direct) return direct;

  for (const [normalizedTitle, prNumber] of normalizedTitleToPr) {
    if (
      normalizedBulletText.startsWith(normalizedTitle) ||
      normalizedTitle.startsWith(normalizedBulletText)
    ) {
      return prNumber;
    }
  }
  return undefined;
}

/**
 * Attach a PR number reference to bullet lines in a markdown section when a matching
 * title exists in the provided map. Keeps existing references intact.
 * @param md Markdown text that may include bullet list items.
 * @param titleToPr Map of original PR titles to PR numbers.
 * @returns Markdown with missing PR references appended to matching bullets.
 */
export function attachPrNumbers(
  md: string,
  titleToPr: TitleToPr,
  repo?: { owner: string; repo: string }
): string {
  const normalizedTitleToPr = buildNormalizedLookup(titleToPr);

  const lines = md.split('\n');
  const updated = lines.map((line) => {
    if (!isBulletLine(line)) return line;
    if (hasInlinePrReference(line)) return line;

    const bulletParts = splitBulletLine(line);
    if (!bulletParts) return line;

    const normalizedBulletText = normalizeTitle(bulletParts.text);
    const matchedPrNumber = findMatchingPrNumber(
      normalizedBulletText,
      normalizedTitleToPr
    );

    if (!matchedPrNumber) return line;

    if (repo) {
      const url = `https://github.com/${repo.owner}/${repo.repo}/pull/${matchedPrNumber}`;
      return `${bulletParts.prefix}${bulletParts.text} in [#${matchedPrNumber}](${url})`;
    }
    return `${bulletParts.prefix}${bulletParts.text} (#${matchedPrNumber})`;
  });
  return updated.join('\n');
}
