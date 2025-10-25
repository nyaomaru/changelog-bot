import { HEAD_REF } from '@/constants/git.js';

/**
 * Convert a git ref to a version string, stripping leading `v`.
 * `HEAD` is mapped to a dev placeholder version.
 * WHY: We allow users to run dry-runs against `HEAD` without tagging.
 * @param ref Git ref, e.g., `v1.2.3` or `HEAD`.
 * @returns Bare version string, e.g., `1.2.3` or `0.0.0-dev`.
 */
export function versionFromRef(ref: string): string {
  return ref === HEAD_REF ? '0.0.0-dev' : String(ref).replace(/^v/, '');
}
