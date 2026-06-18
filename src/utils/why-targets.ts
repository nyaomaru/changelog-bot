import { WHY_ELIGIBLE_SECTION_TITLES } from '@/constants/why.js';
import type { WhyNote, WhyTarget } from '@/types/why.js';
import {
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

const PULL_URL_PR_NUMBER_RE = /\bhttps?:\/\/[^\s)]+\/pull\/(?<prNumber>\d+)\b/i;
const PR_SUFFIX_RE =
  /(?:\bin\s+#(?<plain>\d+)\b|\(#(?<parenthesized>\d+)\))\s*$/i;
const AUTHOR_RE = /\sby\s@(?<author>[\w-]+(?:\[bot\])?)/i;
const BOT_AUTHOR_RE = /(?:\[bot\]|bot$|renovate|dependabot)/i;

function whyNoteKey(sectionTitle: string, prNumber: number): string {
  return `${sectionTitle}\0${prNumber}`;
}

function cleanItemText(line: string): string {
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/\sby\s@[\w-]+(?:\[bot\])?/gi, '')
    .replace(/\s\[#\d+\]\([^)]+\)/g, '')
    .replace(/\s#\d+\b/g, '')
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
      const prNumber = extractPrNumber(line);
      if (!prNumber) {
        skippedBeforeFetch += 1;
        continue;
      }
      const itemText = cleanItemText(line);
      const author = extractAuthor(line);
      if (
        isDependencyUpdateTitle(itemText) ||
        (author && BOT_AUTHOR_RE.test(author))
      ) {
        skippedBeforeFetch += 1;
        continue;
      }
      targets.push({
        prNumber,
        itemText,
        sectionTitle: section.name,
        author,
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
      const prNumber = extractPrNumber(line);
      if (!prNumber) continue;
      const note = notesBySectionAndPr.get(whyNoteKey(section.name, prNumber));
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
