import type {
  ParsedRelease,
  ReleaseItem,
  ReleaseSection,
} from '@/types/release.js';
import { ParsedReleaseSchema } from '@/schema/release.js';
import { SECTION_ORDER } from '@/constants/changelog.js';

const H2_HEADING_RE = /^##\s+(.*)$/;
export const FULL_CHANGELOG_RE = /Full Changelog[^:]*:\s*(\S+)/i;
const BULLET_PREFIX_RE = /^[*-]\s+/;
const PR_URL_RE = /https?:\/\/\S+\/pull\/(\d+)/; // captures PR number
const PR_REF_RE = /\(#?(\d+)\)|#(\d+)/; // (#123) or #123
const AUTHOR_RE = /@([A-Za-z0-9_-]+)/;
const TRAILING_BY_IN_RE = /\s*(by|in)\s*$/i; // strip noisy trailing tokens
import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import {
  stripConventionalPrefix,
  normalizeTitle,
} from '@/utils/title-normalize.js';

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
 * Remove Conventional Commit type/scope prefixes from a title.
 * @param input Title that may start with `type(scope):`.
 * @returns Title without the conventional prefix.
 */
// stripConventionalPrefix moved to utils/title-normalize

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
  const author = authorMatch[1];
  return { author, text: text.replace(authorMatch[0], '').trim() };
}

/**
 * Extract a PR number and URL from release line text, handling inline refs and full URLs.
 * @param text Line content to inspect.
 * @param repo Optional repo owner/name to build URLs when only numbers exist.
 * @returns Parsed PR metadata and the remaining text without the reference.
 */
function extractPr(
  text: string,
  repo?: RepoInfo
): {
  pr?: number;
  url?: string;
  text: string;
} {
  let remainingText = text;
  const urlMatch = remainingText.match(PR_URL_RE);
  if (urlMatch) {
    const url = urlMatch[0];
    const pr = Number(urlMatch[1]);
    remainingText = remainingText.replace(url, '').trim();
    return { pr, url, text: remainingText };
  }

  const refMatch = remainingText.match(PR_REF_RE);
  if (refMatch) {
    const pr = Number(refMatch[1] || refMatch[2]);
    const url = repo
      ? `https://github.com/${repo.owner}/${repo.repo}/pull/${pr}`
      : undefined;
    remainingText = remainingText.replace(refMatch[0], '').trim();
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
    const headingMatch = rawLine.match(H2_HEADING_RE);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { heading: headingMatch[1].trim(), lines: [] };
      continue;
    }
    if (!current) continue;
    current.lines.push(rawLine);
  }

  if (current) sections.push(current);
  return sections;
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
    if (!line || /Full Changelog/i.test(line)) continue;
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
  repo?: RepoInfo
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
    (line) => !FULL_CHANGELOG_RE.test(line)
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
  repo?: RepoInfo
): string | undefined {
  const fullMatch = body.match(FULL_CHANGELOG_RE);
  if (!fullMatch) return undefined;
  const link = fullMatch[1];
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
  repo?: RepoInfo
): ParsedRelease {
  const items: ReleaseItem[] = [];
  const additionalSections: ReleaseSection[] = [];
  if (!body) return { items };

  const h2Sections = collectH2Sections(body);
  const whatsChangedSection = h2Sections.find((section) =>
    /^What's Changed/i.test(section.heading)
  );
  const whatsChangedLines = whatsChangedSection
    ? parseWhatsChangedLines(whatsChangedSection.lines)
    : [];

  for (const line of whatsChangedLines) {
    const item = parseReleaseLine(line, repo);
    if (item) items.push(item);
  }

  for (const section of h2Sections) {
    if (/^What's Changed/i.test(section.heading)) continue;
    if (/^Full Changelog/i.test(section.heading)) continue;
    const structured = toReleaseSection(section);
    if (structured) additionalSections.push(structured);
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

  // Normalize titles for fuzzy matching: lowercase, strip conventional prefix,
  // collapse non-alphanumerics to spaces, and trim.
  const normalize = (s: string) => normalizeTitle(s);

  // Build both exact and normalized lookup maps.
  const titleToItem = new Map<string, ReleaseItem>();
  const normalizedToItem = new Map<string, ReleaseItem>();
  for (const item of items) {
    const keys = [item.title, item.rawTitle].filter(Boolean) as string[];
    // WHY: Avoid redundant insertions when title === rawTitle or keys differ only
    // by reference; Set preserves lookup flexibility without extra work.
    const uniqueKeys = new Set(keys);
    for (const key of uniqueKeys) {
      titleToItem.set(key, item);
      titleToItem.set(key.toLowerCase(), item);
      const norm = normalize(key);
      normalizedToItem.set(norm, item);
    }
  }

  const findItem = (lookupTitle: string): ReleaseItem | undefined => {
    if (!lookupTitle) return undefined;
    const direct =
      titleToItem.get(lookupTitle) ||
      titleToItem.get(lookupTitle.toLowerCase()) ||
      titleToItem.get(stripConventionalPrefix(lookupTitle)) ||
      titleToItem.get(stripConventionalPrefix(lookupTitle).toLowerCase());
    if (direct) return direct;

    // Fuzzy: try normalized matching with bidirectional prefix check.
    const normalizedLookup = normalize(lookupTitle);
    const exact = normalizedToItem.get(normalizedLookup);
    if (exact) return exact;
    for (const [k, item] of normalizedToItem) {
      const minLen = Math.min(k.length, normalizedLookup.length);
      const maxLen = Math.max(k.length, normalizedLookup.length);
      // Only match if the shorter string is at least 50% of the longer
      if (minLen / maxLen < 0.5) continue;
      if (k.startsWith(normalizedLookup) || normalizedLookup.startsWith(k))
        return item;
    }
    return undefined;
  };
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
      const item = findItem(candidateTitle);
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
    lines.push(`### ${section.heading}`, '');
    lines.push(section.body.trim(), '');
  }

  if (params.fullChangelog)
    lines.push(`**Full Changelog**: ${params.fullChangelog}`, '');
  return lines.join('\n');
}
