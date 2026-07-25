import { HEAD_REF } from '@/constants/git.js';

/**
 * Normalize a release name by stripping a semver-style leading `v`.
 * WHY: Explicit display names must otherwise remain unchanged, including
 * reserved ref names such as `HEAD`.
 * @param releaseName Caller-provided release display name.
 * @returns Normalized release name.
 */
export function normalizeReleaseName(releaseName: string): string {
  return releaseName.replace(/^v(?=\d)/, '');
}

/**
 * Convert a git ref to a version string, stripping a semver-style leading `v`.
 * `HEAD` is mapped to a dev placeholder version.
 * WHY: Strip `v` only before a digit so ordinary labels such as
 * `version-2026` are preserved.
 * @param ref Git ref, e.g., `v1.2.3` or `HEAD`.
 * @returns Bare version string, e.g., `1.2.3` or `0.0.0-dev`.
 */
export function versionFromRef(ref: string): string {
  return ref === HEAD_REF ? '0.0.0-dev' : normalizeReleaseName(ref);
}
