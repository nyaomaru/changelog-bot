import { SECTION_ORDER } from '@/constants/changelog.js';
import type { BucketName } from '@/types/changelog.js';
import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import { classifyTitleDeterministically } from '@/utils/deterministic-classification.js';

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
const TYPE_SCOPE_REGEX = CONVENTIONAL_PREFIX_RE;

// BucketName centralized in types/changelog.ts

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
  /** Optional lookup of PR numbers keyed by commit SHA. */
  prMapBySha?: PrNumbersBySha;
}

/**
 * Initialize an empty bucket map keyed by changelog sections.
 * @returns Map of section name to empty string array.
 */
function buildEmptyBuckets(): Record<BucketName, string[]> {
  return SECTION_ORDER.reduce<Record<BucketName, string[]>>(
    (acc, section) => {
      acc[section] = [];
      return acc;
    },
    {} as Record<BucketName, string[]>,
  );
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
 * Remove conventional commit prefix from a subject line.
 * @param subject Commit subject line.
 * @returns Subject without `type(scope):` prefix.
 */
function normalizeSubject(subject: string): string {
  return subject.replace(TYPE_SCOPE_REGEX, '').trim();
}

/**
 * Build a deterministic changelog section when LLM output is unavailable.
 * Uses the same canonical classification precedence as release-note output.
 */
export function fallbackSection(params: FallbackSectionParams): string {
  const { version, date, logs, prMapBySha } = params;
  const lines = (logs || '').split('\n').filter(Boolean);
  const buckets = buildEmptyBuckets();

  for (const logLine of lines) {
    const { sha, subject } = parseLogLine(logLine);
    const normalizedTitle = normalizeSubject(subject);
    const bucket = classifyTitleDeterministically(subject).category;
    // WHY: Subject text like `(#225)` may be an issue. Only confirmed PR metadata is attached.
    const prNumbers = prMapBySha?.[sha];

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
