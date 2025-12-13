import { SECTION_ORDER } from '@/constants/changelog.js';

/** Maps changelog section names to the titles that belong in each. */
export type CategoryMap = Record<string, string[]>;

/** Numeric score per section name used for heuristic category scoring. */
export type CategoryScores = Record<string, number>;

/**
 * Changelog section bucket name derived from SECTION_ORDER.
 * Keeps section identifiers consistent across the codebase.
 */
export type BucketName = (typeof SECTION_ORDER)[number];
