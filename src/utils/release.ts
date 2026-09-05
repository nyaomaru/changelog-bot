// WHY: Preserve the established import surface while keeping parsing,
// commit mapping, and rendering in independently maintainable modules.
export { buildReleaseItemsFromPullRequests } from '@/utils/release-items.js';
export {
  buildReleaseChangeId,
  identifyReleaseItems,
} from '@/utils/release-items.js';
export { parseReleaseNotes } from '@/utils/release-notes.js';
export { buildSectionFromRelease } from '@/utils/release-section.js';
