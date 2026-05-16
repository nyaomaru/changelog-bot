import { HEAD_REF } from '@/constants/git.js';
import { escapeRegExp } from '@/utils/escape.js';

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
  unreleasedLine?: string,
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
        unreleasedLine,
      );
    } else if (!containsLine(unreleasedLine)) {
      updatedContent = `${updatedContent.trim()}\n\n${unreleasedLine}\n`;
    }
  }
  return updatedContent;
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
