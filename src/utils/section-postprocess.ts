import { removeMergedPRs } from '@/utils/remove-merged-prs.js';
import { attachPrNumbers } from '@/utils/attach-pr.js';

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
  return processedMarkdown;
}
