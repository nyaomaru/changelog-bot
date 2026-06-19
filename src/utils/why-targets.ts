import { WHY_ELIGIBLE_SECTION_TITLES } from '@/constants/why.js';
import type { WhyNote, WhyTarget } from '@/types/why.js';
import {
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

const PULL_URL_PR_NUMBER_RE = /\bhttps?:\/\/[^\s)]+\/pull\/(?<prNumber>\d+)\b/i;
const PULL_MARKDOWN_LINK_RE =
  /\s*(?:in\s+)?\[#\d+\]\(https?:\/\/[^\s)]+\/pull\/\d+\b[^)]*\)/gi;
const PULL_URL_RE = /\s*https?:\/\/[^\s)]+\/pull\/\d+\b/gi;
const PR_SUFFIX_RE =
  /(?:\bin\s+#(?<plain>\d+)\b|\(#(?<parenthesized>\d+)\))\s*$/i;
const PR_SUFFIX_TEXT_RE = /\s*(?:\bin\s+#\d+\b|\(#\d+\))\s*$/i;
const AUTHOR_RE = /\sby\s@(?<author>[\w-]+(?:\[bot\])?)/i;
const BOT_AUTHOR_RE = /(?:\[bot\]|bot$|renovate|dependabot)/i;

type ParsedWhyBullet = {
  /** Pull request that owns the changelog bullet. */
  prNumber: number;
  /** Bullet text with only generated PR metadata removed. */
  itemText: string;
  /** Optional author attached to generated release-note bullets. */
  author?: string;
};

function whyNoteKey(sectionTitle: string, prNumber: number): string {
  return `${sectionTitle}\0${prNumber}`;
}

function cleanItemText(line: string): string {
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/\sby\s@[\w-]+(?:\[bot\])?/gi, '')
    .replace(PULL_MARKDOWN_LINK_RE, '')
    .replace(PULL_URL_RE, '')
    .replace(PR_SUFFIX_TEXT_RE, '')
    .trim();
}

function extractPrNumber(line: string): number | null {
  const pullUrlMatch = PULL_URL_PR_NUMBER_RE.exec(line);
  const pullUrlPrNumber = parsePrNumber(pullUrlMatch?.groups?.prNumber);
  if (pullUrlPrNumber) return pullUrlPrNumber;

  const suffixMatch = PR_SUFFIX_RE.exec(line);
  const suffixPrNumber = parsePrNumber(
    suffixMatch?.groups?.plain ?? suffixMatch?.groups?.parenthesized,
  );
  if (suffixPrNumber) return suffixPrNumber;

  // WHY: A prose `#123` may identify an issue or a different PR. Fetch only
  // references whose position or URL establishes that they own this bullet.
  return null;
}

function parsePrNumber(rawNumber: string | undefined): number | null {
  if (!rawNumber) return null;
  const prNumber = Number.parseInt(rawNumber, 10);
  return Number.isSafeInteger(prNumber) ? prNumber : null;
}

function extractAuthor(line: string): string | undefined {
  return AUTHOR_RE.exec(line)?.groups?.author;
}

/**
 * Parse a changelog bullet with an authoritative PR reference.
 * WHY: PR identification and metadata removal must share the same accepted
 * forms so prose issue references remain part of the model context.
 * @param line Markdown bullet line.
 * @returns Parsed bullet or null when no authoritative PR target exists.
 */
function parseWhyBullet(line: string): ParsedWhyBullet | null {
  const prNumber = extractPrNumber(line);
  if (!prNumber) return null;
  return {
    prNumber,
    itemText: cleanItemText(line),
    author: extractAuthor(line),
  };
}

/**
 * Extract PRs that can receive WHY notes from generated changelog markdown.
 * @param sectionMarkdown Generated release section markdown.
 * @returns Eligible changelog PR targets after cheap pre-fetch filtering.
 */
export function extractWhyTargets(sectionMarkdown: string): {
  targets: WhyTarget[];
  skippedBeforeFetch: number;
} {
  const targets: WhyTarget[] = [];
  let skippedBeforeFetch = 0;
  const document = splitMarkdownSections(sectionMarkdown);
  const eligibleSectionTitles = new Set<string>(WHY_ELIGIBLE_SECTION_TITLES);

  for (const section of document.sections) {
    if (!eligibleSectionTitles.has(section.name)) continue;
    for (const line of section.lines) {
      if (!/^[-*]\s+/.test(line)) continue;
      const parsedBullet = parseWhyBullet(line);
      if (!parsedBullet) {
        skippedBeforeFetch += 1;
        continue;
      }
      if (
        isDependencyUpdateTitle(parsedBullet.itemText) ||
        (parsedBullet.author && BOT_AUTHOR_RE.test(parsedBullet.author))
      ) {
        skippedBeforeFetch += 1;
        continue;
      }
      targets.push({
        prNumber: parsedBullet.prNumber,
        itemText: parsedBullet.itemText,
        sectionTitle: section.name,
        author: parsedBullet.author,
      });
    }
  }

  return { targets, skippedBeforeFetch };
}

/**
 * Insert accepted WHY notes under matching top-level changelog bullets.
 * @param sectionMarkdown Generated release section markdown.
 * @param notes Accepted WHY notes keyed by PR number.
 * @param whyLabel User-visible WHY label.
 * @returns Release section markdown with nested WHY bullets.
 */
export function applyWhyNotesToSection(
  sectionMarkdown: string,
  notes: ReadonlyMap<number, WhyNote>,
  whyLabel: string,
): string {
  if (notes.size === 0) return sectionMarkdown;

  const document = splitMarkdownSections(sectionMarkdown);
  const eligibleSectionTitles = new Set<string>(WHY_ELIGIBLE_SECTION_TITLES);
  const notesBySectionAndPr = new Map(
    Array.from(notes.values()).map((note) => [
      whyNoteKey(note.sectionTitle, note.prNumber),
      note,
    ]),
  );

  for (const section of document.sections) {
    if (!eligibleSectionTitles.has(section.name)) continue;

    const outputLines: string[] = [];
    for (let index = 0; index < section.lines.length; index += 1) {
      const line = section.lines[index] ?? '';
      outputLines.push(line);
      if (!/^[-*]\s+/.test(line)) continue;
      const parsedBullet = parseWhyBullet(line);
      if (!parsedBullet) continue;
      const note = notesBySectionAndPr.get(
        whyNoteKey(section.name, parsedBullet.prNumber),
      );
      if (!note) continue;
      const nextLine = section.lines[index + 1] ?? '';
      if (
        new RegExp(`^\\s+-\\s+${escapeRegExp(whyLabel)}\\s*:`, 'i').test(
          nextLine,
        )
      ) {
        continue;
      }
      outputLines.push(`  - ${whyLabel}: ${note.why}`);
    }
    section.lines = outputLines;
  }

  return renderMarkdownSections(document);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
