import { WHY_ELIGIBLE_SECTION_TITLES } from '@/constants/why.js';
import type { WhyNote, WhyTarget } from '@/types/why.js';
import {
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

const PULL_URL_PR_NUMBER_RE =
  /\b(?<pullUrl>https?:\/\/[^\s)]+\/pull\/(?<prNumber>\d+)\b)/gi;
const PULL_LINK_SUFFIX_RE =
  /(?:\bin\s+)?\[#\d+\]\((?<pullUrl>https?:\/\/[^\s)]+\/pull\/(?<prNumber>\d+)\b[^)]*)\)(?:\s+by\s+@[\w-]+(?:\[bot\])?)?\s*$/i;
const PR_SUFFIX_RE =
  /(?:\bin\s+#(?<plain>\d+)\b|\(#(?<parenthesized>\d+)\))\s*$/i;
const AUTHOR_RE = /\sby\s@(?<author>[\w-]+(?:\[bot\])?)/i;
const BOT_AUTHOR_RE = /(?:\[bot\]|bot$|renovate|dependabot)/i;

/** Repository identity used to validate authoritative pull request links. */
export type WhyRepository = {
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Web hostname used by pull request links. */
  host?: string;
};

type OwningPrReference = {
  /** Pull request number parsed from the authoritative reference. */
  prNumber: number;
  /** Start offset of metadata to remove from the rendered item text. */
  startIndex: number;
  /** End offset of metadata to remove from the rendered item text. */
  endIndex: number;
};

type ParsedWhyBullet = {
  /** Pull request that owns the changelog bullet. */
  prNumber: number;
  /** Bullet text with only generated PR metadata removed. */
  itemText: string;
  /** Optional author attached to generated release-note bullets. */
  author?: string;
};

function whyNoteKey(sectionTitle: string, prNumber: number): string {
  return `${sectionTitle}\0${prNumber}`;
}

function cleanItemText(line: string, reference: OwningPrReference): string {
  const lineWithoutOwningReference = `${line.slice(0, reference.startIndex)}${line.slice(reference.endIndex)}`;
  return lineWithoutOwningReference
    .replace(/^[-*]\s+/, '')
    .replace(/\sby\s@[\w-]+(?:\[bot\])?/gi, '')
    .replace(/\s*(?:in\s+)?\[#\d+\]\(\)/gi, '')
    .trim();
}

function isCurrentRepositoryPullUrl(
  pullUrl: string | undefined,
  repository: WhyRepository,
): boolean {
  if (!pullUrl) return false;
  try {
    const parsedUrl = new URL(pullUrl);
    const expectedHost = repository.host ?? 'github.com';
    if (parsedUrl.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
      return false;
    }
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    return (
      pathSegments[0]?.toLowerCase() === repository.owner.toLowerCase() &&
      pathSegments[1]?.toLowerCase() === repository.repo.toLowerCase() &&
      pathSegments[2]?.toLowerCase() === 'pull' &&
      /^\d+$/.test(pathSegments[3] ?? '')
    );
  } catch {
    return false;
  }
}

function extractOwningPrReference(
  line: string,
  repository: WhyRepository,
): OwningPrReference | null {
  const suffixMatch = PR_SUFFIX_RE.exec(line);
  const suffixPrNumber = parsePrNumber(
    suffixMatch?.groups?.plain ?? suffixMatch?.groups?.parenthesized,
  );
  if (suffixMatch && suffixPrNumber) {
    return {
      prNumber: suffixPrNumber,
      startIndex: suffixMatch.index,
      endIndex: suffixMatch.index + suffixMatch[0].length,
    };
  }

  const linkedSuffixMatch = PULL_LINK_SUFFIX_RE.exec(line);
  const linkedSuffixPrNumber = parsePrNumber(
    linkedSuffixMatch?.groups?.prNumber,
  );
  if (
    linkedSuffixMatch &&
    linkedSuffixPrNumber &&
    isCurrentRepositoryPullUrl(linkedSuffixMatch.groups?.pullUrl, repository)
  ) {
    return {
      prNumber: linkedSuffixPrNumber,
      startIndex: linkedSuffixMatch.index,
      endIndex: linkedSuffixMatch.index + linkedSuffixMatch[0].length,
    };
  }

  const pullUrlMatches = Array.from(
    line.matchAll(PULL_URL_PR_NUMBER_RE),
  ).filter((match) =>
    isCurrentRepositoryPullUrl(match.groups?.pullUrl, repository),
  );
  const lastPullUrlMatch = pullUrlMatches[pullUrlMatches.length - 1];
  const pullUrlPrNumber = parsePrNumber(lastPullUrlMatch?.groups?.prNumber);
  if (lastPullUrlMatch && pullUrlPrNumber) {
    return {
      prNumber: pullUrlPrNumber,
      startIndex: lastPullUrlMatch.index,
      endIndex: lastPullUrlMatch.index + lastPullUrlMatch[0].length,
    };
  }

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
 * Parse a changelog bullet with an authoritative PR reference.
 * WHY: PR identification and metadata removal must share the same accepted
 * forms so prose issue references remain part of the model context.
 * @param line Markdown bullet line.
 * @param repository Repository whose pull requests are authoritative.
 * @returns Parsed bullet or null when no authoritative PR target exists.
 */
function parseWhyBullet(
  line: string,
  repository: WhyRepository,
): ParsedWhyBullet | null {
  const reference = extractOwningPrReference(line, repository);
  if (!reference) return null;
  return {
    prNumber: reference.prNumber,
    itemText: cleanItemText(line, reference),
    author: extractAuthor(line),
  };
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
  const eligibleSectionTitles = new Set<string>(WHY_ELIGIBLE_SECTION_TITLES);

  for (const section of document.sections) {
    if (!eligibleSectionTitles.has(section.name)) continue;
    for (const line of section.lines) {
      if (!/^[-*]\s+/.test(line)) continue;
      const parsedBullet = parseWhyBullet(line, repository);
      if (!parsedBullet) {
        skippedBeforeFetch += 1;
        continue;
      }
      if (
        isDependencyUpdateTitle(parsedBullet.itemText) ||
        (parsedBullet.author && BOT_AUTHOR_RE.test(parsedBullet.author))
      ) {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
