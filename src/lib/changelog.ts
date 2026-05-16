export { computeChangelog } from '@/lib/changelog-compute.js';
export { diffChangelog } from '@/lib/changelog-diff.js';
export { readChangelog, writeChangelog } from '@/lib/changelog-file.js';
export {
  ensureCompareLinks,
  updateCompareLinks,
} from '@/lib/changelog-links.js';
export {
  hasDuplicateVersion,
  hasSection,
  insertSection,
  removeAllSections,
  replaceSection,
} from '@/lib/changelog-sections.js';
