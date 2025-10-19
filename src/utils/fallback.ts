import { SECTION_ORDER } from '@/constants/changelog.js';
import {
  CONVENTIONAL_PREFIX_RE,
  INLINE_PR_NUMBER_RE,
} from '@/constants/conventional.js';

/**
 * Format a bullet entry with an optional PR reference suffix.
 * WHY: We only include the first PR to keep the output compact and scannable.
 * @param title Bullet title text.
 * @param prNumbers Optional list of PR numbers linked to the commit.
 * @returns Markdown bullet line.
 */
function formatBulletWithPrRef(title: string, prNumbers?: number[]) {
  if (!prNumbers || prNumbers.length === 0) return `- ${title}`;
  // Only the first PR number is used when multiple PRs exist.
  const [firstPr] = prNumbers;
  return firstPr ? `- ${title} (#${firstPr})` : `- ${title}`;
}

// WHY: Centralize patterns/keywords to avoid scattered magic literals and
// make the classification/stripping logic easier to maintain.
const PR_REF_REGEX = INLINE_PR_NUMBER_RE;
const TYPE_SCOPE_REGEX = CONVENTIONAL_PREFIX_RE;
const BREAKING_MARKER_REGEX = /!:\s*/; // conventional `type!:` marker
const TYPE_TO_SECTION_REGEX = {
  Added: /^feat(\(|:)/i,
  Fixed: /^fix(\(|:)/i,
  Changed: /^(refactor|perf|style)(\(|:)/i,
  Docs: /^docs(\(|:)/i,
  Build: /^(build|ci)(\(|:)/i,
  Test: /^test(\(|:)/i,
  Reverted: /^revert(\(|:)/i,
} as const;

type BucketName = (typeof SECTION_ORDER)[number];

/** Mapping of commit SHAs to the PR numbers they reference. */
type PrNumbersBySha = Record<string, number[]>;

/** Parameters consumed by the fallback changelog section generator. */
interface FallbackSectionParams {
  /** Release version string without the leading `v`. */
  version: string;
  /** Release date in ISO format. */
  date: string;
  /** Raw `git log` output used to build buckets. */
  logs: string;
  /** Optional preformatted PR list used when LLM output is unavailable. */
  prs?: string;
  /** Optional lookup of PR numbers keyed by commit SHA. */
  prMapBySha?: PrNumbersBySha;
}

/**
 * Initialize an empty bucket map keyed by changelog sections.
 * @returns Map of section name to empty string array.
 */
function buildEmptyBuckets(): Record<BucketName, string[]> {
  return SECTION_ORDER.reduce<Record<BucketName, string[]>>((acc, section) => {
    acc[section] = [];
    return acc;
  }, {} as Record<BucketName, string[]>);
}

/**
 * Parse a `git log --pretty="%h %s"` line into SHA and subject.
 * @param line Single log line.
 * @returns Parsed SHA and subject string.
 */
function parseLogLine(line: string): { sha: string; subject: string } {
  const [sha, ...messageParts] = line.split(' ');
  return { sha, subject: messageParts.join(' ').trim() };
}

/**
 * Determine the target changelog section for a commit subject.
 * @param subject Commit subject line.
 * @returns Section bucket name.
 */
function detectBucket(subject: string): BucketName {
  const lower = subject.toLowerCase();
  if (TYPE_TO_SECTION_REGEX.Added.test(lower)) return 'Added';
  if (TYPE_TO_SECTION_REGEX.Fixed.test(lower)) return 'Fixed';
  if (TYPE_TO_SECTION_REGEX.Changed.test(lower)) return 'Changed';
  if (TYPE_TO_SECTION_REGEX.Docs.test(lower)) return 'Docs';
  if (TYPE_TO_SECTION_REGEX.Build.test(lower)) return 'Build';
  if (TYPE_TO_SECTION_REGEX.Test.test(lower)) return 'Test';
  if (TYPE_TO_SECTION_REGEX.Reverted.test(lower)) return 'Reverted';
  if (BREAKING_MARKER_REGEX.test(subject)) return 'Breaking Changes';
  return 'Chore';
}

/**
 * Remove conventional commit prefix from a subject line.
 * @param subject Commit subject line.
 * @returns Subject without `type(scope):` prefix.
 */
function normalizeSubject(subject: string): string {
  return subject.replace(TYPE_SCOPE_REGEX, '').trim();
}

/**
 * Extract PR numbers from either provided map or inline references in the subject.
 * @param sha Commit SHA used to look up precomputed mappings.
 * @param subject Commit subject for inline extraction.
 * @param prMapBySha Optional mapping of commits to PR numbers.
 * @returns List of PR numbers or undefined when none found.
 */
function extractPrNumbers(
  sha: string,
  subject: string,
  prMapBySha?: PrNumbersBySha
): number[] | undefined {
  if (prMapBySha?.[sha]?.length) {
    return prMapBySha[sha];
  }

  const inlineRefs = subject.match(PR_REF_REGEX) || [];
  if (!inlineRefs.length) return undefined;
  return inlineRefs.map((matchText) => Number(matchText.slice(1)));
}

/**
 * Build a conservative changelog section when LLM classification fails or is unavailable.
 * Heuristically groups commit messages by conventional commit prefix.
 */
export function fallbackSection(params: FallbackSectionParams): string {
  const { version, date, logs, prMapBySha: providedPrMap } = params;
  const lines = (logs || '').split('\n').filter(Boolean);
  const buckets = buildEmptyBuckets();

  const prMapBySha: PrNumbersBySha = providedPrMap ? { ...providedPrMap } : {};

  for (const logLine of lines) {
    const { sha, subject } = parseLogLine(logLine);
    const normalizedTitle = normalizeSubject(subject);
    const bucket = detectBucket(subject);
    const prNumbers = extractPrNumbers(sha, subject, prMapBySha);

    buckets[bucket].push(formatBulletWithPrRef(normalizedTitle, prNumbers));
  }

  const output = [`## [v${version}] - ${date}`];
  for (const sectionName of SECTION_ORDER) {
    const sectionItems = buckets[sectionName];
    if (sectionItems?.length) {
      output.push(`### ${sectionName}`, ...sectionItems, '');
    }
  }

  const hasAnyItems = SECTION_ORDER.some((section) => buckets[section]?.length);
  if (!hasAnyItems) output.push('### Changed', '- Summary of changes', '');
  return output.join('\n');
}
