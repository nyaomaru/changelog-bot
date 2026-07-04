import { WHY_ELIGIBLE_SECTION_TITLES } from '@/constants/why.js';
import type { WhyNote, WhyTarget } from '@/types/why.js';
import {
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';
import { escapeRegExp } from '@/utils/escape.js';
import {
  parseWhyBullet,
  type WhyRepository,
} from '@/utils/why-pr-reference.js';

export type { WhyRepository } from '@/utils/why-pr-reference.js';

const BOT_AUTHOR_RE = /(?:\[bot\]|bot$|renovate|dependabot)/i;
const WHY_ELIGIBLE_SECTION_TITLE_SET = new Set<string>(
  WHY_ELIGIBLE_SECTION_TITLES,
);
const TOP_LEVEL_BULLET_RE = /^[-*]\s+/;

function whyNoteKey(sectionTitle: string, prNumber: number): string {
  return `${sectionTitle}\0${prNumber}`;
}

function shouldSkipWhyTarget(itemText: string, author?: string): boolean {
  return Boolean(
    isDependencyUpdateTitle(itemText) || (author && BOT_AUTHOR_RE.test(author)),
  );
}

/**
 * Extract PRs that can receive WHY notes from generated changelog markdown.
 * @param sectionMarkdown Generated release section markdown.
 * @param repository Repository whose pull requests are authoritative.
 * @returns Eligible changelog PR targets after cheap pre-fetch filtering.
 */
export function extractWhyTargets(
  sectionMarkdown: string,
  repository: WhyRepository,
): {
  targets: WhyTarget[];
  skippedBeforeFetch: number;
} {
  const targets: WhyTarget[] = [];
  let skippedBeforeFetch = 0;
  const document = splitMarkdownSections(sectionMarkdown);

  for (const section of document.sections) {
    if (!WHY_ELIGIBLE_SECTION_TITLE_SET.has(section.name)) continue;
    for (const line of section.lines) {
      if (!TOP_LEVEL_BULLET_RE.test(line)) continue;
      const parsedBullet = parseWhyBullet(line, repository);
      if (!parsedBullet) {
        skippedBeforeFetch += 1;
        continue;
      }
      if (shouldSkipWhyTarget(parsedBullet.itemText, parsedBullet.author)) {
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
 * @param repository Repository whose pull requests are authoritative.
 * @returns Release section markdown with nested WHY bullets.
 */
export function applyWhyNotesToSection(
  sectionMarkdown: string,
  notes: ReadonlyMap<number, WhyNote>,
  whyLabel: string,
  repository: WhyRepository,
): string {
  if (notes.size === 0) return sectionMarkdown;

  const document = splitMarkdownSections(sectionMarkdown);
  const notesBySectionAndPr = new Map(
    Array.from(notes.values()).map((note) => [
      whyNoteKey(note.sectionTitle, note.prNumber),
      note,
    ]),
  );

  for (const section of document.sections) {
    if (!WHY_ELIGIBLE_SECTION_TITLE_SET.has(section.name)) continue;

    const outputLines: string[] = [];
    for (let index = 0; index < section.lines.length; index += 1) {
      const line = section.lines[index] ?? '';
      outputLines.push(line);
      if (!TOP_LEVEL_BULLET_RE.test(line)) continue;
      const parsedBullet = parseWhyBullet(line, repository);
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
