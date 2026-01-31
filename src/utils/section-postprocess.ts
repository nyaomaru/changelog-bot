import { removeMergedPRs } from '@/utils/remove-merged-prs.js';
import { attachPrNumbers } from '@/utils/attach-pr.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';
import {
  SECTION_BREAKING_CHANGES,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_ORDER,
} from '@/constants/changelog.js';
import {
  BULLET_PREFIX_RE,
  H3_SUBHEADER_CAPTURE_RE,
} from '@/constants/markdown.js';

const SECTION_ORDER_INDEX = new Map(
  SECTION_ORDER.map((sectionName, index) => [sectionName.toLowerCase(), index]),
);

type SectionBlock = {
  headingLine: string;
  name: string;
  lines: string[];
};

function parseSectionName(line: string): string | null {
  const match = line.match(H3_SUBHEADER_CAPTURE_RE);
  return match ? match[1].trim() : null;
}

function splitSections(markdown: string): {
  preamble: string[];
  sections: SectionBlock[];
} {
  const lines = markdown.split('\n');
  const preamble: string[] = [];
  const sections: SectionBlock[] = [];
  let current: SectionBlock | null = null;

  for (const line of lines) {
    const heading = parseSectionName(line);
    if (heading) {
      if (current) sections.push(current);
      current = { headingLine: line, name: heading, lines: [] };
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (current) sections.push(current);
  return { preamble, sections };
}

function hasMeaningfulContent(lines: string[]): boolean {
  return lines.some((line) => line.trim().length > 0);
}

function appendBulletLines(section: SectionBlock, bullets: string[]): void {
  if (!bullets.length) return;
  const existing = new Set(
    section.lines
      .filter((line) => BULLET_PREFIX_RE.test(line))
      .map((line) => line.trim()),
  );
  const uniqueBullets = bullets.filter((line) => !existing.has(line.trim()));
  if (!uniqueBullets.length) return;

  const hasContent = section.lines.some((line) => line.trim().length > 0);
  if (!hasContent) {
    section.lines = ['', ...uniqueBullets, ''];
    return;
  }

  if (!section.lines.length || section.lines[0].trim() !== '') {
    section.lines.unshift('');
  }

  let insertIndex = section.lines.length;
  while (insertIndex > 0 && section.lines[insertIndex - 1].trim() === '') {
    insertIndex -= 1;
  }
  section.lines.splice(insertIndex, 0, ...uniqueBullets);

  if (!section.lines.length || section.lines[section.lines.length - 1].trim()) {
    section.lines.push('');
  }
}

function moveDependencyUpdatesToChore(markdown: string): string {
  if (!markdown) return markdown;
  const { preamble, sections } = splitSections(markdown);
  if (!sections.length) return markdown;

  const changedIndex = sections.findIndex(
    (section) => section.name.toLowerCase() === SECTION_CHANGED.toLowerCase(),
  );
  if (changedIndex === -1) return markdown;

  const changedSection = sections[changedIndex];
  const movedBullets: string[] = [];
  const retainedLines: string[] = [];

  for (const line of changedSection.lines) {
    if (!BULLET_PREFIX_RE.test(line)) {
      retainedLines.push(line);
      continue;
    }
    const title = line.replace(BULLET_PREFIX_RE, '').trim();
    if (isDependencyUpdateTitle(title)) {
      movedBullets.push(line);
    } else {
      retainedLines.push(line);
    }
  }

  if (!movedBullets.length) return markdown;
  changedSection.lines = retainedLines;

  if (!hasMeaningfulContent(changedSection.lines)) {
    sections.splice(changedIndex, 1);
  }

  let choreSection = sections.find(
    (section) => section.name.toLowerCase() === SECTION_CHORE.toLowerCase(),
  );
  if (!choreSection) {
    const choreOrder =
      SECTION_ORDER_INDEX.get(SECTION_CHORE.toLowerCase()) ??
      Number.POSITIVE_INFINITY;
    let insertIndex = sections.length;
    for (let i = 0; i < sections.length; i += 1) {
      const currentOrder =
        SECTION_ORDER_INDEX.get(sections[i].name.toLowerCase()) ??
        Number.POSITIVE_INFINITY;
      if (currentOrder > choreOrder) {
        insertIndex = i;
        break;
      }
    }
    choreSection = {
      headingLine: `### ${SECTION_CHORE}`,
      name: SECTION_CHORE,
      lines: [],
    };
    sections.splice(insertIndex, 0, choreSection);
  }

  appendBulletLines(choreSection, movedBullets);

  const output: string[] = [];
  output.push(...preamble);
  for (const section of sections) {
    output.push(section.headingLine);
    output.push(...section.lines);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

function moveBreakingChangesToTop(markdown: string): string {
  if (!markdown) return markdown;
  const { preamble, sections } = splitSections(markdown);
  if (!sections.length) return markdown;

  const isBreakingWithContent = (section: SectionBlock) =>
    section.name.toLowerCase() === SECTION_BREAKING_CHANGES.toLowerCase() &&
    hasMeaningfulContent(section.lines);

  const breakingSections = sections.filter(isBreakingWithContent);
  if (!breakingSections.length) return markdown;

  let breakingAfterNonBreaking = false;
  let foundNonBreaking = false;
  for (const section of sections) {
    if (isBreakingWithContent(section)) {
      if (foundNonBreaking) {
        breakingAfterNonBreaking = true;
        break;
      }
    } else {
      foundNonBreaking = true;
    }
  }

  if (!breakingAfterNonBreaking && isBreakingWithContent(sections[0]))
    return markdown;

  const otherSections = sections.filter(
    (section) => !isBreakingWithContent(section),
  );
  const output: string[] = [];
  output.push(...preamble);
  for (const section of [...breakingSections, ...otherSections]) {
    output.push(section.headingLine);
    output.push(...section.lines);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Apply standard post-processing to a generated changelog section.
 * - Removes redundant merged PR bullet lines that duplicate individual entries.
 * - Attaches PR numbers to bullet titles when a mapping is known.
 * @param markdown Section markdown produced by the LLM or fallback.
 * @param titleToPr Lookup from normalized bullet titles to PR numbers.
 * @returns Cleaned and enriched section markdown.
 */
export function postprocessSection(
  markdown: string,
  titleToPr: Record<string, number>,
  repo?: { owner: string; repo: string },
): string {
  // WHY: Keep the section concise and link-rich for reviewers.
  let processedMarkdown = removeMergedPRs(markdown);
  processedMarkdown = attachPrNumbers(processedMarkdown, titleToPr, repo);
  processedMarkdown = moveDependencyUpdatesToChore(processedMarkdown);
  processedMarkdown = moveBreakingChangesToTop(processedMarkdown);
  return processedMarkdown;
}
