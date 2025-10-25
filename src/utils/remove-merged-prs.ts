/**
 * Remove the "Merged PRs" section from a markdown changelog snippet.
 * WHY: This section is noise for our generated changelog; we keep only categorized entries.
 * @param md Markdown text potentially containing a "Merged PRs" section.
 * @returns Markdown without the "Merged PRs" section and normalized blank lines.
 */
export function removeMergedPRs(md: string): string {
  const lines = md.split('\n');
  const kept: string[] = [];
  let skippingMergedSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (skippingMergedSection) {
      if (/^###\s+/.test(trimmed)) {
        skippingMergedSection = false;
        // Fall through so the new section header is preserved.
      } else {
        continue;
      }
    }

    if (/^###\s+Merged PRs/i.test(trimmed)) {
      skippingMergedSection = true;
      continue;
    }

    kept.push(line);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}
