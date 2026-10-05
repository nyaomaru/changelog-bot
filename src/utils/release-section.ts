import { SECTION_ORDER } from '@/constants/changelog.js';
import type { CategoryAssignments } from '@/types/changelog.js';
import type { ReleaseChange, ReleaseSection } from '@/types/release.js';
import {
  CHANGELOG_ADDITIONAL_SECTION_HEADING_LEVEL,
  demoteAdditionalSectionHeadings,
} from '@/utils/release-markdown.js';

import { DEFAULT_WHY_LABEL } from '@/constants/why.js';

function appendReleaseItemBullet(
  lines: string[],
  item: ReleaseChange,
  whyLabel: string,
): void {
  let line = `- ${item.title}`;
  if (item.author) line += ` by @${item.author}`;
  if (item.pr && item.url) line += ` in [#${item.pr}](${item.url})`;
  lines.push(line);
  if (item.why) {
    lines.push(`  - ${whyLabel}: ${item.why}`);
  }
}

function appendCategorizedReleaseSections(
  lines: string[],
  changes: ReleaseChange[],
  assignments: CategoryAssignments,
  whyLabel: string,
): void {
  for (const section of SECTION_ORDER) {
    const entries = changes.filter(
      (change) => assignments[change.id] === section,
    );
    if (!entries.length) continue;

    lines.push(`### ${section}`, '');
    for (const item of entries) appendReleaseItemBullet(lines, item, whyLabel);
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
  whyLabel?: string;
}): string {
  const {
    version,
    date,
    changes,
    assignments,
    sections = [],
    whyLabel = DEFAULT_WHY_LABEL,
  } = params;
  const lines: string[] = [`## [v${version}] - ${date}`, ''];

  appendCategorizedReleaseSections(lines, changes, assignments, whyLabel);
  appendAdditionalReleaseSections(lines, sections);

  if (params.fullChangelog) {
    lines.push(`**Full Changelog**: ${params.fullChangelog}`, '');
  }
  return lines.join('\n');
}
