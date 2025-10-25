import { readFileSync, writeFileSync } from 'node:fs';
import { escapeRegExp } from '@/utils/escape.js';
import { UNRELEASED_ANCHOR } from '@/constants/changelog.js';
import { ANY_H2_HEADING_RE } from '@/constants/markdown.js';
import { HEAD_REF } from '@/constants/git.js';

/**
 * Read changelog content from a file path.
 * @param path Absolute or relative path to the changelog file.
 * @returns Changelog text; returns an empty string when the file does not exist.
 */
export function readChangelog(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Insert a rendered section below the given anchor heading, or near the top when absent.
 * If `anchor` is not an H2 heading ("## "), it falls back to the conventional
 * Unreleased anchor to avoid placing content under an unintended line.
 * @param changelog Existing changelog text.
 * @param anchor Heading text to insert below (e.g., "## [v1.2.3] - 2025-01-01").
 * @param newSection Section content to insert; outer blank lines are trimmed.
 * @returns Updated changelog with the section inserted at the intended position.
 */
export function insertSection(
  changelog: string,
  anchor: string,
  newSection: string
): string {
  const isHeading = /^##\s/.test(anchor);
  const safeAnchor = isHeading ? anchor : UNRELEASED_ANCHOR;

  // Normalize the new section: trim outer blank lines to avoid piling up
  const normalizedSection = newSection.trim();

  // WHY: Match the anchor as a full line to avoid incidental partial matches
  // within other lines (use multiline flag to anchor with ^ and $).
  // NOTE: Do not consume the trailing newline after the anchor line.
  // Using a lookahead ensures we stop before a line break or end-of-input.
  const anchorRegExp = new RegExp(
    `^${escapeRegExp(safeAnchor)}[^\\S\\r\\n]*(?=\\r?\\n|$)`,
    'm'
  );
  const anchorMatch = changelog.match(anchorRegExp);
  if (anchorMatch && anchorMatch.index !== undefined) {
    const anchorStartIndex = anchorMatch.index;
    const anchorLine = anchorMatch[0];
    const beforeAnchor = changelog.slice(0, anchorStartIndex);
    const afterAnchor = changelog.slice(anchorStartIndex + anchorLine.length);
    // Ensure exactly two newlines after anchor and before/after the inserted section
    const afterAnchorStripped = afterAnchor.replace(/^\n+/, '');
    return `${beforeAnchor}${anchorLine}\n\n${normalizedSection}\n\n${afterAnchorStripped}`;
  }

  // If anchor not found, attempt to preserve a header block (e.g. "# Changelog")
  const existingContent = changelog.replace(/^\n+/, '');

  // Find the first "## " heading which marks the start of changelog sections
  const firstHeadingMatch = existingContent.match(ANY_H2_HEADING_RE);
  if (firstHeadingMatch?.index !== undefined) {
    const firstHeadingIndex = firstHeadingMatch.index;
    if (firstHeadingIndex > 0) {
      // There is a header block before the first section
      const header = existingContent.slice(0, firstHeadingIndex).trimEnd();
      const rest = existingContent.slice(firstHeadingIndex).replace(/^\n+/, '');
      return `${header}\n\n${normalizedSection}\n\n${rest}`;
    }
    // No header block before the first section
    return `${normalizedSection}\n\n${existingContent}`;
  }

  // No "## " sections yet; treat entire existing content as header block if present
  if (existingContent.trim() !== '') {
    return `${existingContent.trimEnd()}\n\n${normalizedSection}\n`;
  }

  // Fallback: prepend at the very top
  return `${normalizedSection}\n\n${existingContent}`;
}

/**
 * Ensure compare/unreleased link definitions exist or are updated at the bottom.
 * Appends the `compareLine` and optionally the `unreleasedLine` when absent.
 * @param content Changelog text to modify.
 * @param compareLine Compare link definition for the current release.
 * @param unreleasedLine Optional Unreleased compare link definition.
 * @returns Updated changelog content with link definitions ensured.
 */
export function updateCompareLinks(
  content: string,
  compareLine?: string,
  unreleasedLine?: string
): string {
  let updatedContent = content;

  // Helper: does a line exist (ignoring trailing whitespace differences)?
  const containsLine = (line: string): boolean => {
    const lineRegExp = new RegExp(`^${escapeRegExp(line)}\\s*$`, 'm');
    return lineRegExp.test(updatedContent);
  };

  if (compareLine && !containsLine(compareLine)) {
    updatedContent = `${updatedContent.trim()}\n\n${compareLine}\n`;
  }

  if (unreleasedLine) {
    // WHY: Use a broad pattern to replace any existing Unreleased definition,
    // independent of exact URL or whitespace differences.
    const unreleasedLinkRegExp = /^\[Unreleased\]:\s+.+$/m;
    if (unreleasedLinkRegExp.test(updatedContent)) {
      updatedContent = updatedContent.replace(
        unreleasedLinkRegExp,
        unreleasedLine
      );
    } else if (!containsLine(unreleasedLine)) {
      updatedContent = `${updatedContent.trim()}\n\n${unreleasedLine}\n`;
    }
  }
  return updatedContent;
}

/**
 * Write changelog text to disk, overwriting any existing content.
 * @param path Destination file path.
 * @param content Changelog text to write.
 */
export function writeChangelog(path: string, content: string) {
  writeFileSync(path, content, 'utf8');
}

/**
 * Detect duplicate version link labels like "[v1.2.3]" within the content.
 * @param content Changelog text to scan.
 * @param version Semantic version string without leading "v".
 * @returns True when the link label appears more than once.
 */
export function hasDuplicateVersion(content: string, version: string): boolean {
  const regExp = new RegExp(`\\[v${escapeRegExp(version)}\\]`, 'g');
  return (content.match(regExp) ?? []).length > 1;
}

/**
 * Check if a section heading for a version exists, e.g., "## [v1.2.3]".
 * @param content Changelog text to scan.
 * @param version Semantic version string without leading "v".
 * @returns True when the heading exists.
 */
export function hasSection(content: string, version: string): boolean {
  const regExp = new RegExp(`^##\\s*\\[v${escapeRegExp(version)}\\]`, 'm');
  return regExp.test(content);
}

/**
 * Replace a specific version section with new content.
 * Section is matched from the heading line until the next version heading or end.
 * @param content Changelog text to modify.
 * @param version Version (no leading "v").
 * @param newSection Replacement section text; outer blank lines are trimmed.
 * @returns Updated changelog with the target section replaced.
 */
export function replaceSection(
  content: string,
  version: string,
  newSection: string
): string {
  // WHY: Consume the heading line to avoid zero-width matches that could
  // repeatedly match the same position. Non-greedy until next heading or EOF.
  const regExp = new RegExp(
    `^##\\s*\\[v${escapeRegExp(
      version
    )}\\][^\\n]*\\n[\\s\\S]*?(?=^##\\s*\\[|\\s*$)`,
    'm'
  );
  if (!regExp.test(content)) return content;
  return content.replace(regExp, newSection.trim());
}

/**
 * Remove all sections that match the given version.
 * Useful when a version appears multiple times and needs deduplication.
 * @param content Changelog text to modify.
 * @param version Version (no leading "v").
 * @returns Content with all matching sections removed and spacing normalized.
 */
export function removeAllSections(content: string, version: string): string {
  // WHY: Global removal with non-greedy section capture until the next heading
  // or EOF; also collapses runs of blank lines afterwards for cleanliness.
  const regExp = new RegExp(
    `^##\\s*\\[v${escapeRegExp(
      version
    )}\\][^\\n]*\\n[\\s\\S]*?(?=^##\\s*\\[|\\s*$)`,
    'gm'
  );
  return content
    .replace(regExp, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
}

/**
 * Build compare and unreleased link definitions for a version.
 * Leaves updating/inserting to the caller via `updateCompareLinks`.
 * @param opts.owner GitHub owner/org name.
 * @param opts.repo Repository name.
 * @param opts.prevTag Previous tag or ref used as compare base.
 * @param opts.releaseRef Current release ref or tag (e.g., a SHA or tag).
 * @param opts.version Version string without leading "v".
 * @param opts.existing Current changelog content to inspect for Unreleased.
 * @returns Object containing `compareLine` and optionally `unreleasedLine`.
 */
export function ensureCompareLinks(opts: {
  owner: string;
  repo: string;
  prevTag: string;
  releaseRef: string;
  version: string;
  existing: string;
}) {
  const { owner, repo, prevTag, releaseRef, version, existing } = opts;
  const base = `https://github.com/${owner}/${repo}`;
  const compareLine = `[v${version}]: ${base}/compare/${prevTag}...${releaseRef}`;

  const hasUnreleased = /^\[Unreleased\]: .+$/m.test(existing);
  let unreleasedLine: string | undefined;
  if (hasUnreleased && releaseRef !== HEAD_REF) {
    unreleasedLine = `[Unreleased]: ${base}/compare/${releaseRef}...${HEAD_REF}`;
  }

  return {
    compareLine,
    unreleasedLine,
  };
}
