import { SECTION_ORDER } from '@/constants/changelog.js';
import type { CategoryAssignments } from '@/types/changelog.js';
import type { ReleaseChange, ReleaseSection } from '@/types/release.js';
import {
  CHANGELOG_ADDITIONAL_SECTION_HEADING_LEVEL,
  demoteAdditionalSectionHeadings,
} from '@/utils/release-markdown.js';

function formatReleaseItemBullet(item: ReleaseChange): string {
  let line = `- ${item.title}`;
  if (item.author) line += ` by @${item.author}`;
  if (item.pr && item.url) line += ` in [#${item.pr}](${item.url})`;
  return line;
}

function appendCategorizedReleaseSections(
  lines: string[],
  changes: ReleaseChange[],
  assignments: CategoryAssignments,
): void {
  for (const section of SECTION_ORDER) {
    const entries = changes.filter(
      (change) => assignments[change.id] === section,
    );
    if (!entries.length) continue;

    lines.push(`### ${section}`, '');
    for (const item of entries) lines.push(formatReleaseItemBullet(item));
    lines.push('');
  }
}

function appendAdditionalReleaseSections(
  lines: string[],
  sections: ReleaseSection[],
): void {
  for (const section of sections) {
    lines.push(
      `${'#'.repeat(CHANGELOG_ADDITIONAL_SECTION_HEADING_LEVEL)} ${section.heading}`,
      '',
      demoteAdditionalSectionHeadings(section.body.trim()),
      '',
    );
  }
}

/**
 * Build a categorized changelog section from parsed release data.
 * @param params Version, date, changes, category assignments, and optional additions.
 * @returns Markdown section string.
 */
export function buildSectionFromRelease(params: {
  version: string;
  date: string;
  changes: ReleaseChange[];
  assignments: CategoryAssignments;
  fullChangelog?: string;
  sections?: ReleaseSection[];
}): string {
  const { version, date, changes, assignments, sections = [] } = params;
  const lines: string[] = [`## [v${version}] - ${date}`, ''];

  appendCategorizedReleaseSections(lines, changes, assignments);
  appendAdditionalReleaseSections(lines, sections);

  if (params.fullChangelog) {
    lines.push(`**Full Changelog**: ${params.fullChangelog}`, '');
  }
  return lines.join('\n');
}
