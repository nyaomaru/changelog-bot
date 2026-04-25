import {
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';

/**
 * Remove the "Merged PRs" section from a markdown changelog snippet.
 * WHY: This section is noise for our generated changelog; we keep only categorized entries.
 * @param md Markdown text potentially containing a "Merged PRs" section.
 * @returns Markdown without the "Merged PRs" section and normalized blank lines.
 */
export function removeMergedPRs(md: string): string {
  const document = splitMarkdownSections(md);
  document.sections = document.sections.filter(
    (section) => !section.name.toLowerCase().startsWith('merged prs'),
  );
  return renderMarkdownSections(document);
}
