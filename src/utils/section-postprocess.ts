import { removeMergedPRs } from '@/utils/remove-merged-prs.js';
import { attachPrNumbers } from '@/utils/attach-pr.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';
import {
  SECTION_BREAKING_CHANGES,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_ORDER,
} from '@/constants/changelog.js';
import { BULLET_PREFIX_RE } from '@/constants/markdown.js';
import {
  appendUniqueBulletLines,
  hasMeaningfulMarkdownContent,
  renderMarkdownSections,
  splitMarkdownSections,
  type MarkdownSectionBlock,
} from '@/utils/markdown-sections.js';

const SECTION_ORDER_INDEX = new Map(
  SECTION_ORDER.map((sectionName, index) => [sectionName.toLowerCase(), index]),
);

function moveDependencyUpdatesToChore(markdown: string): string {
  if (!markdown) return markdown;
  const document = splitMarkdownSections(markdown);
  const { sections } = document;
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

  if (!hasMeaningfulMarkdownContent(changedSection.lines)) {
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

  appendUniqueBulletLines(choreSection, movedBullets);
  return renderMarkdownSections(document);
}

function moveBreakingChangesToTop(markdown: string): string {
  if (!markdown) return markdown;
  const document = splitMarkdownSections(markdown);
  const { sections } = document;
  if (!sections.length) return markdown;

  const isBreakingWithContent = (section: MarkdownSectionBlock) =>
    section.name.toLowerCase() === SECTION_BREAKING_CHANGES.toLowerCase() &&
    hasMeaningfulMarkdownContent(section.lines);

  const breakingSections = sections.filter(isBreakingWithContent);
  if (!breakingSections.length) return markdown;

  const mergeBreakingLines = (blocks: MarkdownSectionBlock[]): string[] => {
    const merged: string[] = [];
    for (const block of blocks) {
      if (merged.length) {
        const last = merged[merged.length - 1];
        const nextFirst = block.lines[0];
        if (last?.trim() && nextFirst?.trim()) {
          merged.push('');
        }
      }
      merged.push(...block.lines);
    }
    return merged;
  };

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

  const hasMultipleBreaking = breakingSections.length > 1;
  if (
    !breakingAfterNonBreaking &&
    !hasMultipleBreaking &&
    isBreakingWithContent(sections[0])
  )
    return markdown;

  const mergedBreakingSection: MarkdownSectionBlock = {
    headingLine: breakingSections[0].headingLine,
    name: SECTION_BREAKING_CHANGES,
    lines: mergeBreakingLines(breakingSections),
  };
  document.sections = [
    mergedBreakingSection,
    ...sections.filter((section) => !isBreakingWithContent(section)),
  ];
  return renderMarkdownSections(document);
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
