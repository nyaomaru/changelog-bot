import type {
  ParsedRelease,
  ReleaseItem,
  ReleaseSection,
} from '@/types/release.js';
import { ParsedReleaseSchema } from '@/schema/release.js';
import { SECTION_ORDER } from '@/constants/changelog.js';
import { stripConventionalPrefix } from '@/utils/title-normalize.js';
import { FULL_CHANGELOG_RE } from '@/constants/release.js';
import { BULLET_PREFIX_RE } from '@/constants/markdown.js';
import { buildTitleLookup, findTitleMatch } from '@/utils/title-lookup.js';

const MIN_MARKDOWN_ATX_HEADING_LEVEL = 1;
const RELEASE_SECTION_HEADING_LEVEL = 2;
const CHANGELOG_ADDITIONAL_SECTION_HEADING_LEVEL = 3;
const HEADING_LEVEL_STEP = 1;
const MAX_MARKDOWN_ATX_HEADING_LEVEL = 6;
const ATX_HEADING_MARKER_RE_SOURCE = `#{${MIN_MARKDOWN_ATX_HEADING_LEVEL},${MAX_MARKDOWN_ATX_HEADING_LEVEL}}`;
const ATX_HEADING_RE = new RegExp(
  `^(${ATX_HEADING_MARKER_RE_SOURCE})(?!#)\\s+(.*)$`,
);
const H2_HEADING_RE = new RegExp(
  `^${'#'.repeat(RELEASE_SECTION_HEADING_LEVEL)}\\s+(.*)$`,
);
const PREFIXED_ATX_HEADING_RE = new RegExp(
  `^([^\\p{L}\\p{N}#>*+-]+?)(${ATX_HEADING_MARKER_RE_SOURCE})(?!#)\\s+(.*)$`,
  'u',
);
const PREFIXED_HEADING_MARKER_MATCH_INDEX = 2;
const PREFIXED_HEADING_TEXT_MATCH_INDEX = 3;
const HEADING_MARKER_MATCH_INDEX = 1;
const HEADING_TEXT_MATCH_INDEX = 2;
const RELEASE_HEADING_TEXT_MATCH_INDEX = 1;
const FENCE_MARKER_MATCH_INDEX = 1;
const AUTHOR_USERNAME_MATCH_INDEX = 1;
const FULL_MATCH_INDEX = 0;
const URL_PR_NUMBER_MATCH_INDEX = 1;
const REF_PAREN_PR_NUMBER_MATCH_INDEX = 1;
const REF_HASH_PR_NUMBER_MATCH_INDEX = 2;
const FULL_CHANGELOG_LINK_MATCH_INDEX = 1;
const MIN_NESTED_ADDITIONAL_SECTION_HEADING_LEVEL =
  CHANGELOG_ADDITIONAL_SECTION_HEADING_LEVEL + HEADING_LEVEL_STEP;
const RELEASE_TITLE_MATCH_MIN_RELATIVE_PREFIX_LENGTH = 0.5;
const PR_URL_RE = /https?:\/\/\S+\/pull\/(\d+)/; // captures PR number
const PR_REF_RE = /\(#?(\d+)\)|#(\d+)/; // (#123) or #123
const AUTHOR_RE = /@([A-Za-z0-9_-]+)/;
const TRAILING_BY_IN_RE = /\s*(by|in)\s*$/i; // strip noisy trailing tokens
const TYPOGRAPHIC_APOSTROPHE_RE = /[’`´]/g;
const COLLAPSE_WHITESPACE_RE = /\s+/g;

/** GitHub repository owner/name pair used for compare link construction. */
type RepoInfo = {
  /** Repository owner or organization name. */
  owner: string;
  /** Repository name. */
  repo: string;
};

/** Captures an H2 heading and its associated markdown lines. */
type RawSection = {
  /** Raw heading text without the leading markdown marker. */
  heading: string;
  /** Lines belonging to the section body. */
  lines: string[];
};

/**
 * Remove leading markdown bullet markers (`- ` or `* `) from a line.
 * @param input Raw bullet line.
 * @returns Line contents without the bullet prefix.
 */
function stripBulletPrefix(input: string): string {
  return input.replace(BULLET_PREFIX_RE, '').trim();
}

/**
 * Normalize stray non-text prefixes before Markdown ATX headings.
 * @param line Raw release-note line.
 * @returns Line with accidental heading prefixes removed.
 */
function normalizeReleaseHeadingLine(line: string): string {
  if (ATX_HEADING_RE.test(line)) return line;

  const prefixedHeadingMatch = line.match(PREFIXED_ATX_HEADING_RE);
  if (!prefixedHeadingMatch) return line;

  return [
    prefixedHeadingMatch[PREFIXED_HEADING_MARKER_MATCH_INDEX],
    prefixedHeadingMatch[PREFIXED_HEADING_TEXT_MATCH_INDEX],
  ].join(' ');
}

/**
 * Parse an H2 heading from a normalized release-note line.
 * @param line Raw release-note line.
 * @returns Heading text or `undefined` when the line is not an H2 heading.
 */
function parseReleaseHeading(line: string): string | undefined {
  const headingMatch = line.match(H2_HEADING_RE);
  return headingMatch
    ? headingMatch[RELEASE_HEADING_TEXT_MATCH_INDEX].trim()
    : undefined;
}

/**
 * Demote headings inside release-note sections to fit under changelog H3 headings.
 * @param body Additional release-note section body.
 * @returns Body with nested ATX headings adjusted for changelog output.
 */
function demoteAdditionalSectionHeadings(body: string): string {
  let inFence = false;
  let fenceMarker: string | undefined;

  return body
    .split('\n')
    .map((rawLine) => {
      const line = inFence ? rawLine : normalizeReleaseHeadingLine(rawLine);
      const fenceMatch = line.match(/^\s*(```|~~~)/);
      if (fenceMatch) {
        const marker = fenceMatch[FENCE_MARKER_MATCH_INDEX];
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (marker === fenceMarker) {
          inFence = false;
          fenceMarker = undefined;
        }
        return line;
      }

      if (inFence) return line;

      const headingMatch = line.match(ATX_HEADING_RE);
      if (!headingMatch) return line;

      const headingLevel = headingMatch[HEADING_MARKER_MATCH_INDEX].length;
      const nestedLevel = Math.min(
        Math.max(
          headingLevel + HEADING_LEVEL_STEP,
          MIN_NESTED_ADDITIONAL_SECTION_HEADING_LEVEL,
        ),
        MAX_MARKDOWN_ATX_HEADING_LEVEL,
      );
      return `${'#'.repeat(nestedLevel)} ${headingMatch[HEADING_TEXT_MATCH_INDEX]}`;
    })
    .join('\n');
}

/**
 * Strip trailing "by"/"in" tokens used in GitHub release lines.
 * WHY: Release notes often include trailing attribution like " by" or " in"; we remove them for cleaner titles.
 * @param input Line content potentially ending with attribution tokens.
 * @returns Trimmed line without trailing noise.
 */
function stripTrailingByIn(input: string): string {
  // Some lines may contain multiple trailing tokens; keep stripping until stable.
  let trimmed = input.trim();
  while (TRAILING_BY_IN_RE.test(trimmed)) {
    trimmed = trimmed.replace(TRAILING_BY_IN_RE, '').trim();
  }
  return trimmed;
}

/**
 * Extract a GitHub username from inline "@user" mentions.
 * @param text Line content to scan.
 * @returns Author (if present) and the line without the mention.
 */
function extractAuthor(text: string): { author?: string; text: string } {
  const authorMatch = text.match(AUTHOR_RE);
  if (!authorMatch) return { text };
  const author = authorMatch[AUTHOR_USERNAME_MATCH_INDEX];
  return {
    author,
    text: text.replace(authorMatch[FULL_MATCH_INDEX], '').trim(),
  };
}

/**
 * Extract a PR number and URL from release line text, handling inline refs and full URLs.
 * @param text Line content to inspect.
 * @param repo Optional repo owner/name to build URLs when only numbers exist.
 * @returns Parsed PR metadata and the remaining text without the reference.
 */
function extractPr(
  text: string,
  repo?: RepoInfo,
): {
  pr?: number;
  url?: string;
  text: string;
} {
  let remainingText = text;
  const urlMatch = remainingText.match(PR_URL_RE);
  if (urlMatch) {
    const url = urlMatch[FULL_MATCH_INDEX];
    const pr = Number(urlMatch[URL_PR_NUMBER_MATCH_INDEX]);
    remainingText = remainingText.replace(url, '').trim();
    return { pr, url, text: remainingText };
  }

  const refMatch = remainingText.match(PR_REF_RE);
  if (refMatch) {
    const pr = Number(
      refMatch[REF_PAREN_PR_NUMBER_MATCH_INDEX] ||
        refMatch[REF_HASH_PR_NUMBER_MATCH_INDEX],
    );
    const url = repo
      ? `https://github.com/${repo.owner}/${repo.repo}/pull/${pr}`
      : undefined;
    remainingText = remainingText
      .replace(refMatch[FULL_MATCH_INDEX], '')
      .trim();
    return { pr, url, text: remainingText };
  }
  return { text: remainingText };
}

/**
 * Collect H2 sections (`## Heading`) and their lines from release body.
 * @param body Full release body markdown.
 * @returns Array of sections preserving original line order.
 */
function collectH2Sections(body: string): RawSection[] {
  const lines = body.split(/\r?\n/);
  const sections: RawSection[] = [];
  let current: RawSection | null = null;

  for (const rawLine of lines) {
    // WHY: When release-body text is copied or routed through workflow inputs,
    // stray non-text prefixes can appear before headings. Normalize ATX heading
    // lines first, then only H2 headings become release-note section boundaries.
    const line = normalizeReleaseHeadingLine(rawLine);
    const heading = parseReleaseHeading(line);
    if (heading) {
      if (current) sections.push(current);
      current = { heading, lines: [] };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
  }

  if (current) sections.push(current);
  return sections;
}

/**
 * Normalize heading text to compare release-note section names robustly.
 * WHY: Users often edit release notes with typographic apostrophes or inconsistent spacing.
 * @param heading Raw heading content.
 * @returns Normalized heading for case-insensitive matching.
 */
function normalizeHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(TYPOGRAPHIC_APOSTROPHE_RE, "'")
    .replace(COLLAPSE_WHITESPACE_RE, ' ');
}

/**
 * Check whether an H2 heading refers to the canonical "What's Changed" section.
 * @param heading Heading text without markdown markers.
 * @returns True when the heading is a "What's Changed" variant.
 */
function isWhatsChangedHeading(heading: string): boolean {
  const normalizedHeading = normalizeHeading(heading);
  return (
    normalizedHeading.startsWith("what's changed") ||
    normalizedHeading.startsWith('whats changed')
  );
}

/**
 * Check whether an H2 heading is the "Full Changelog" block.
 * @param heading Heading text without markdown markers.
 * @returns True when the heading denotes the full changelog section.
 */
function isFullChangelogHeading(heading: string): boolean {
  return normalizeHeading(heading).startsWith('full changelog');
}

/**
 * Collect the bullet lines under the provided "What's Changed" section lines.
 * @param lines Section content lines following the heading.
 * @returns Array of relevant bullet lines.
 */
function parseWhatsChangedLines(lines: string[]): string[] {
  const collected: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || FULL_CHANGELOG_RE.test(line)) continue;
    collected.push(line);
  }
  return collected;
}

/**
 * Parse a single "What's Changed" bullet into structured release item data.
 * @param line Raw bullet line including PR reference and author attribution.
 * @param repo Optional repo info used to construct PR URLs.
 * @returns Structured `ReleaseItem` or `undefined` when parsing fails.
 */
function parseReleaseLine(
  line: string,
  repo?: RepoInfo,
): ReleaseItem | undefined {
  if (!line) return undefined;
  const text = stripBulletPrefix(line);
  const { pr, url, text: textWithoutPr } = extractPr(text, repo);
  const { author, text: authorStripped } = extractAuthor(textWithoutPr);
  const withoutByIn = stripTrailingByIn(authorStripped);
  const rawTitle = withoutByIn;
  const title = stripConventionalPrefix(withoutByIn);
  if (!title) return undefined;
  return { title, rawTitle, author, pr, url };
}

/**
 * Convert a raw section into a structured release section with trimmed body.
 * @param section Raw heading and associated lines.
 * @returns Release section with normalized body string or undefined when empty.
 */
function toReleaseSection(section: RawSection): ReleaseSection | undefined {
  const filteredLines = section.lines.filter(
    (line) => !FULL_CHANGELOG_RE.test(line),
  );
  const body = filteredLines.join('\n').trim();
  if (!body) return undefined;
  return { heading: section.heading, body };
}

/**
 * Extract and normalize the "Full Changelog" link from release notes.
 * @param body Full release body.
 * @param repo Optional repo info for converting tag ranges into compare URLs.
 * @returns Absolute URL when detected.
 */
function extractFullChangelog(
  body: string,
  repo?: RepoInfo,
): string | undefined {
  const fullMatch = body.match(FULL_CHANGELOG_RE);
  if (!fullMatch) return undefined;
  const link = fullMatch[FULL_CHANGELOG_LINK_MATCH_INDEX];
  if (/^https?:\/\//.test(link)) return link;
  if (repo)
    return `https://github.com/${repo.owner}/${repo.repo}/compare/${link}`;
  return undefined;
}

/**
 * Parse GitHub release notes ("What's Changed" section) into structured items.
 * Extracts title, PR number and URL, and author when present.
 * WHY: Release notes format varies; we normalize noise like trailing "by"/"in" and conventional prefixes.
 * @param body Full release body text.
 * @param repo Optional repo info to construct PR URLs when only numbers are present.
 * @returns Parsed items and optional full changelog URL.
 */
export function parseReleaseNotes(
  body: string,
  repo?: RepoInfo,
): ParsedRelease {
  const items: ReleaseItem[] = [];
  const additionalSections: ReleaseSection[] = [];
  if (!body) return { items };

  const h2Sections = collectH2Sections(body);
  const whatsChangedLines = h2Sections
    .filter((section) => isWhatsChangedHeading(section.heading))
    .flatMap((section) => parseWhatsChangedLines(section.lines));

  for (const line of whatsChangedLines) {
    const item = parseReleaseLine(line, repo);
    if (item) items.push(item);
  }

  const seenSections = new Set<string>();
  for (const section of h2Sections) {
    if (isWhatsChangedHeading(section.heading)) continue;
    if (isFullChangelogHeading(section.heading)) continue;
    const structured = toReleaseSection(section);
    if (!structured) continue;

    const sectionKey = `${normalizeHeading(structured.heading)}\n${structured.body.trim()}`;
    if (seenSections.has(sectionKey)) continue;
    seenSections.add(sectionKey);
    additionalSections.push(structured);
  }

  const fullChangelog = extractFullChangelog(body, repo);
  const candidate: ParsedRelease = {
    items,
    fullChangelog,
    sections: additionalSections.length ? additionalSections : undefined,
  };
  const parsed = ParsedReleaseSchema.safeParse(candidate);
  // Return the validated shape when possible; otherwise, return the candidate (best-effort).
  return parsed.success ? parsed.data : candidate;
}

/**
 * Build a categorized changelog section from parsed release items and category mapping.
 * @param params Version/date, parsed items, mapping of categories->titles, and optional full changelog link.
 * @returns Markdown section string.
 */
export function buildSectionFromRelease(params: {
  version: string;
  date: string;
  items: ReleaseItem[];
  categories: Record<string, string[]>;
  fullChangelog?: string;
  sections?: ReleaseSection[];
}): string {
  const { version, date, items, categories, sections = [] } = params;
  const itemLookup = buildTitleLookup(
    items.map((item) => ({
      // WHY: LLM output can refer to either the stripped or raw release-note title.
      titles: new Set([item.title, item.rawTitle].filter(Boolean) as string[]),
      value: item,
    })),
  );
  const lines: string[] = [`## [v${version}] - ${date}`, ''];

  function formatBullet(item: ReleaseItem): string {
    let line = `- ${item.title}`;
    if (item.author) line += ` by @${item.author}`;
    if (item.pr && item.url) line += ` in [#${item.pr}](${item.url})`;
    return line;
  }

  // Track items already assigned to enforce single-category membership within this version
  const seen = new Set<string>();

  for (const section of SECTION_ORDER) {
    const titles = categories[section] || [];
    const entries: ReleaseItem[] = [];
    for (const candidateTitle of titles) {
      const item = findTitleMatch(candidateTitle, itemLookup, {
        minRelativePrefixLength: RELEASE_TITLE_MATCH_MIN_RELATIVE_PREFIX_LENGTH,
      });
      if (item) {
        const key = item.pr
          ? `pr-${item.pr}`
          : `title-${item.title}-${item.rawTitle ?? ''}`;
        if (!seen.has(key)) {
          entries.push(item);
          seen.add(key);
        }
      }
    }
    if (!entries.length) continue;

    lines.push(`### ${section}`, '');
    for (const item of entries) lines.push(formatBullet(item));
    lines.push('');
  }

  for (const section of sections) {
    lines.push(
      `${'#'.repeat(CHANGELOG_ADDITIONAL_SECTION_HEADING_LEVEL)} ${section.heading}`,
      '',
    );
    lines.push(demoteAdditionalSectionHeadings(section.body.trim()), '');
  }

  if (params.fullChangelog)
    lines.push(`**Full Changelog**: ${params.fullChangelog}`, '');
  return lines.join('\n');
}
