import type { ClassificationChange } from '@/types/changelog.js';
import type { ReleaseChange } from '@/types/release.js';

/**
 * Build provider inputs without manufacturing semantic commit prefixes.
 * WHY: Artificial `fix:` or `refactor:` prefixes would be indistinguishable
 * from authoritative source signals when deterministic hard rules run later.
 * @param items Canonical release changes to prepare for classification.
 * @returns Stable IDs paired with original classification context.
 */
export function buildChangesForClassification(
  items: ReleaseChange[],
): ClassificationChange[] {
  return items.map((item) => ({
    id: item.id,
    title: (item.rawTitle ?? item.title).trim(),
  }));
}
