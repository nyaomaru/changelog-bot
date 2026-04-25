import {
  BULLET_PREFIX_RE,
  H3_SUBHEADER_CAPTURE_RE,
} from '@/constants/markdown.js';

/** Parsed markdown section headed by an H3 (`###`) line. */
export type MarkdownSectionBlock = {
  /** Original heading line including markdown markers. */
  headingLine: string;
  /** Heading text without the leading `###`. */
  name: string;
  /** Lines that belong to the section body. */
  lines: string[];
};

/** Markdown document split into preamble lines and H3 sections. */
export type MarkdownSectionDocument = {
  /** Lines before the first H3 section. */
  preamble: string[];
  /** Parsed H3 sections in original order. */
  sections: MarkdownSectionBlock[];
};

/**
 * Parse the section name from an H3 markdown heading.
 * @param line Raw markdown line.
 * @returns Heading text or `null` when the line is not an H3 heading.
 */
export function parseMarkdownSectionName(line: string): string | null {
  const match = line.match(H3_SUBHEADER_CAPTURE_RE);
  return match ? match[1].trim() : null;
}

/**
 * Split markdown into leading preamble lines and H3 sections.
 * WHY: Multiple post-processing steps need the same structural parse, and
 * sharing it avoids drift between section-moving utilities.
 * @param markdown Raw markdown document.
 * @returns Parsed document preserving line order.
 */
export function splitMarkdownSections(
  markdown: string,
): MarkdownSectionDocument {
  const lines = markdown.split('\n');
  const preamble: string[] = [];
  const sections: MarkdownSectionBlock[] = [];
  let currentSection: MarkdownSectionBlock | null = null;

  for (const line of lines) {
    const heading = parseMarkdownSectionName(line);
    if (heading) {
      if (currentSection) sections.push(currentSection);
      currentSection = { headingLine: line, name: heading, lines: [] };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (currentSection) sections.push(currentSection);
  return { preamble, sections };
}

/**
 * Check whether section lines contain any non-whitespace content.
 * @param lines Section body lines.
 * @returns True when the section contains meaningful content.
 */
export function hasMeaningfulMarkdownContent(lines: string[]): boolean {
  return lines.some((line) => line.trim().length > 0);
}

/**
 * Append bullet lines to a section while preserving spacing and avoiding duplicates.
 * @param section Section to modify in place.
 * @param bullets Bullet lines to append.
 */
export function appendUniqueBulletLines(
  section: MarkdownSectionBlock,
  bullets: string[],
): void {
  if (!bullets.length) return;

  const existingBullets = new Set(
    section.lines
      .filter((line) => BULLET_PREFIX_RE.test(line))
      .map((line) => line.trim()),
  );
  const uniqueBullets = bullets.filter(
    (line) => !existingBullets.has(line.trim()),
  );
  if (!uniqueBullets.length) return;

  if (!hasMeaningfulMarkdownContent(section.lines)) {
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

/**
 * Render a parsed markdown document back to text with normalized blank lines.
 * @param document Parsed markdown document.
 * @returns Serialized markdown.
 */
export function renderMarkdownSections(
  document: MarkdownSectionDocument,
): string {
  const output: string[] = [];
  output.push(...document.preamble);
  for (const section of document.sections) {
    output.push(section.headingLine);
    output.push(...section.lines);
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n');
}
