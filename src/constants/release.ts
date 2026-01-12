/**
 * Regex to capture the URL or range following a "Full Changelog:" label in release notes.
 * Captures the first non-space sequence after the colon.
 */
export const FULL_CHANGELOG_RE = /Full Changelog[^:]*:\s*(\S+)/i;
