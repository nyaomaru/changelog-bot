// WHY: Preserve the established import surface while keeping parsing,
// commit mapping, and rendering in independently maintainable modules.
export { buildReleaseItemsFromPullRequests } from '@/utils/release-items.js';
export {
  buildCommitReleaseChanges,
  buildIdentifiedReleaseItems,
  buildReleaseChangeId,
  deduplicateReleaseChangesByPullRequest,
  expandReleaseChangesWithSubChanges,
  identifyReleaseItems,
} from '@/utils/release-items.js';
export { parseReleaseNotes } from '@/utils/release-notes.js';
export { buildSectionFromRelease } from '@/utils/release-section.js';
export { validateReleaseResult } from '@/utils/release-validation.js';
