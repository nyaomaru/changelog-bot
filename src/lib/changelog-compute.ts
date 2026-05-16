import { UNRELEASED_ANCHOR } from '@/constants/changelog.js';
import { updateCompareLinks } from '@/lib/changelog-links.js';
import {
  hasDuplicateVersion,
  hasSection,
  insertSection,
  removeAllSections,
  replaceSection,
} from '@/lib/changelog-sections.js';

/**
 * Compute the next changelog content deterministically from inputs.
 * WHY: Keep I/O out of core logic so dry-runs and tests remain pure/idempotent.
 * @param current Existing changelog text.
 * @param options Operation parameters.
 * @returns Updated changelog.
 */
export function computeChangelog(
  current: string,
  options: {
    version: string;
    newSection: string;
    insertAfterAnchor?: string;
    compareLine?: string;
    unreleasedLine?: string;
  },
): string {
  const {
    version,
    newSection,
    insertAfterAnchor = UNRELEASED_ANCHOR,
    compareLine,
    unreleasedLine,
  } = options;

  let next = current;
  if (hasDuplicateVersion(next, version)) {
    next = removeAllSections(next, version);
  }

  if (hasSection(next, version)) {
    next = replaceSection(next, version, newSection);
  } else {
    next = insertSection(next, insertAfterAnchor, newSection);
  }

  next = updateCompareLinks(next, compareLine, unreleasedLine);
  return next;
}
