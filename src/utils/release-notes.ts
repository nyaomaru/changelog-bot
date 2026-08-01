import { BULLET_PREFIX_RE } from '@/constants/markdown.js';
import { FULL_CHANGELOG_RE } from '@/constants/release.js';
import { ParsedReleaseSchema } from '@/schema/release.js';
import type {
  ParsedRelease,
  ReleaseItem,
  ReleaseSection,
} from '@/types/release.js';
import {
  collectReleaseH2Sections,
  type RawReleaseSection,
} from '@/utils/release-markdown.js';
import { stripConventionalPrefix } from '@/utils/title-normalize.js';

const AUTHOR_USERNAME_MATCH_INDEX = 1;
const FULL_MATCH_INDEX = 0;
const URL_PR_NUMBER_MATCH_INDEX = 1;
const REF_PAREN_PR_NUMBER_MATCH_INDEX = 1;
const REF_HASH_PR_NUMBER_MATCH_INDEX = 2;
const FULL_CHANGELOG_LINK_MATCH_INDEX = 1;
const PR_URL_RE = /https?:\/\/\S+\/pull\/(\d+)/;
const PR_REF_RE = /\(#?(\d+)\)|#(\d+)/;
const AUTHOR_RE = /@([A-Za-z0-9_-]+)/;
const TRAILING_BY_IN_RE = /\s*(by|in)\s*$/i;
const TYPOGRAPHIC_APOSTROPHE_RE = /[’`´]/g;
const COLLAPSE_WHITESPACE_RE = /\s+/g;

type RepoInfo = {
  owner: string;
  repo: string;
};

function stripBulletPrefix(input: string): string {
  return input.replace(BULLET_PREFIX_RE, '').trim();
}

function stripTrailingByIn(input: string): string {
  let trimmed = input.trim();
  while (TRAILING_BY_IN_RE.test(trimmed)) {
    trimmed = trimmed.replace(TRAILING_BY_IN_RE, '').trim();
  }
  return trimmed;
}

function extractAuthor(text: string): { author?: string; text: string } {
  const authorMatch = text.match(AUTHOR_RE);
  if (!authorMatch) return { text };
  return {
    author: authorMatch[AUTHOR_USERNAME_MATCH_INDEX],
    text: text.replace(authorMatch[FULL_MATCH_INDEX], '').trim(),
  };
}

function extractPr(
  text: string,
  repo?: RepoInfo,
): { pr?: number; url?: string; text: string } {
  let remainingText = text;
  const urlMatch = remainingText.match(PR_URL_RE);
  if (urlMatch) {
    const url = urlMatch[FULL_MATCH_INDEX];
    const pr = Number(urlMatch[URL_PR_NUMBER_MATCH_INDEX]);
    return { pr, url, text: remainingText.replace(url, '').trim() };
  }

  const refMatch = remainingText.match(PR_REF_RE);
  if (!refMatch) return { text: remainingText };

  const pr = Number(
    refMatch[REF_PAREN_PR_NUMBER_MATCH_INDEX] ||
      refMatch[REF_HASH_PR_NUMBER_MATCH_INDEX],
  );
  const url = repo
    ? `https://github.com/${repo.owner}/${repo.repo}/pull/${pr}`
    : undefined;
  remainingText = remainingText.replace(refMatch[FULL_MATCH_INDEX], '').trim();
  return { pr, url, text: remainingText };
}

function normalizeHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(TYPOGRAPHIC_APOSTROPHE_RE, "'")
    .replace(COLLAPSE_WHITESPACE_RE, ' ');
}

function isWhatsChangedHeading(heading: string): boolean {
  const normalizedHeading = normalizeHeading(heading);
  return (
    normalizedHeading.startsWith("what's changed") ||
    normalizedHeading.startsWith('whats changed')
  );
}

function isFullChangelogHeading(heading: string): boolean {
  return normalizeHeading(heading).startsWith('full changelog');
}

function parseWhatsChangedLines(lines: string[]): string[] {
  const collected: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line && !FULL_CHANGELOG_RE.test(line)) collected.push(line);
  }
  return collected;
}

function parseReleaseLine(
  line: string,
  repo?: RepoInfo,
): ReleaseItem | undefined {
  if (!line) return undefined;
  const text = stripBulletPrefix(line);
  const { pr, url, text: textWithoutPr } = extractPr(text, repo);
  const { author, text: authorStripped } = extractAuthor(textWithoutPr);
  const rawTitle = stripTrailingByIn(authorStripped);
  const title = stripConventionalPrefix(rawTitle);
  if (!title) return undefined;
  return { title, rawTitle, author, pr, url };
}

function toReleaseSection(
  section: RawReleaseSection,
): ReleaseSection | undefined {
  const filteredLines = section.lines.filter(
    (line) => !FULL_CHANGELOG_RE.test(line),
  );
  const body = filteredLines.join('\n').trim();
  if (!body) return undefined;
  return { heading: section.heading, body };
}

function extractFullChangelog(
  body: string,
  repo?: RepoInfo,
): string | undefined {
  const fullMatch = body.match(FULL_CHANGELOG_RE);
  if (!fullMatch) return undefined;
  const link = fullMatch[FULL_CHANGELOG_LINK_MATCH_INDEX];
  if (/^https?:\/\//.test(link)) return link;
  return repo
    ? `https://github.com/${repo.owner}/${repo.repo}/compare/${link}`
    : undefined;
}

/**
 * Parse GitHub release notes into structured items and additional sections.
 * @param body Full release body text.
 * @param repo Optional repo info for constructing PR and compare URLs.
 * @returns Validated release-note items, sections, and compare link.
 */
export function parseReleaseNotes(
  body: string,
  repo?: RepoInfo,
): ParsedRelease {
  const items: ReleaseItem[] = [];
  const additionalSections: ReleaseSection[] = [];
  if (!body) return { items };

  const h2Sections = collectReleaseH2Sections(body);
  const whatsChangedLines = h2Sections
    .filter((section) => isWhatsChangedHeading(section.heading))
    .flatMap((section) => parseWhatsChangedLines(section.lines));

  for (const line of whatsChangedLines) {
    const item = parseReleaseLine(line, repo);
    if (item) items.push(item);
  }

  const seenSections = new Set<string>();
  for (const section of h2Sections) {
    if (
      isWhatsChangedHeading(section.heading) ||
      isFullChangelogHeading(section.heading)
    ) {
      continue;
    }
    const structuredSection = toReleaseSection(section);
    if (!structuredSection) continue;

    const sectionKey = `${normalizeHeading(structuredSection.heading)}\n${structuredSection.body.trim()}`;
    if (seenSections.has(sectionKey)) continue;
    seenSections.add(sectionKey);
    additionalSections.push(structuredSection);
  }

  const candidate: ParsedRelease = {
    items,
    fullChangelog: extractFullChangelog(body, repo),
    sections: additionalSections.length ? additionalSections : undefined,
  };
  const parsed = ParsedReleaseSchema.safeParse(candidate);
  return parsed.success ? parsed.data : candidate;
}
