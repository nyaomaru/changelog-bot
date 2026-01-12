import { commitsFromMerge, extractPrRefsFromText } from '@/lib/git.js';
import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import type { CommitLite } from '@/types/commit.js';

type PrNumbersBySha = Record<string, number[]>;
type ApiPrMap = Record<string, { number: number }[]>;

/**
 * Normalize commit/PR titles by removing conventional prefixes and lowercasing.
 * @param title Raw commit subject or PR title.
 * @returns Normalized title key.
 */
function normalizeTitle(title: string): string {
  return title.replace(CONVENTIONAL_PREFIX_RE, '').trim().toLowerCase();
}

/**
 * Collect PR number hints embedded in commit subjects (e.g., "(#123)").
 * @param commitList Commits to inspect.
 * @returns Map from commit SHA to inline-detected PR numbers.
 */
function collectInlinePrHints(commitList: CommitLite[]): PrNumbersBySha {
  const hints: PrNumbersBySha = {};
  for (const commit of commitList) {
    const numbers = extractPrRefsFromText(commit.subject);
    if (numbers.length) hints[commit.sha] = numbers;
  }
  return hints;
}

/**
 * Merge multiple PR number iterables into a deduplicated array.
 * @param sources Collections of PR numbers gathered from hints or API data.
 * @returns Deduplicated list of PR numbers.
 */
function mergePrNumbers(...sources: Array<Iterable<number>>): number[] {
  const merged = new Set<number>();
  for (const source of sources) {
    for (const value of source) merged.add(value);
  }
  return [...merged];
}

/**
 * Propagate PR numbers from merge commits down to the commits they contain.
 * WHY: GitHub APIs often attach PR numbers to merge commits only; we expand them to constituent commits for attribution.
 * @param prsLog Merge commit log produced by `gitMergedPRs`.
 * @param repoPath Repository path for running git commands.
 * @param prMapBySha Mutable map of commit SHA to PR numbers.
 */
function expandMergePrs(
  prsLog: string,
  repoPath: string,
  prMapBySha: PrNumbersBySha,
) {
  for (const line of prsLog.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [mergeSha] = trimmed.split(' ');
    const numbers = mergeSha ? prMapBySha[mergeSha] : undefined;
    if (!mergeSha || !numbers?.length) continue;

    const shasInMerge = commitsFromMerge(mergeSha, repoPath);
    for (const commitSha of shasInMerge) {
      prMapBySha[commitSha] = mergePrNumbers(
        numbers,
        prMapBySha[commitSha] ?? [],
      );
    }
  }
}

/**
 * Build a mapping from commit SHA to PR numbers by combining:
 * - inline commit hints (e.g., "#123" in subject)
 * - API-provided commit->PR associations
 * - merge commit expansion to propagate PR to contained commits
 * @param options Inputs including `commitList`, `prsLog`, `repoPath`, and optional `apiPrMap`.
 * @returns Mapping of commit SHA to associated PR numbers (deduped).
 */
export function buildPrMapBySha(options: {
  commitList: CommitLite[];
  prsLog: string;
  repoPath: string;
  apiPrMap?: ApiPrMap;
}): PrNumbersBySha {
  const { commitList, prsLog, repoPath, apiPrMap } = options;

  const prHintsBySha = collectInlinePrHints(commitList);
  const prMapBySha: PrNumbersBySha = {};

  for (const commit of commitList) {
    const hintNumbers = prHintsBySha[commit.sha] ?? [];
    const apiNumbers = (apiPrMap?.[commit.sha] ?? []).map((pr) => pr.number);
    const merged = mergePrNumbers(hintNumbers, apiNumbers);
    if (merged.length) prMapBySha[commit.sha] = merged;
  }

  // WHY: A merge commit may represent a PR; expand its PR number to contained commits
  // so we can later attribute bullet points to the correct PR.
  expandMergePrs(prsLog, repoPath, prMapBySha);

  return prMapBySha;
}

/**
 * Build a lookup from normalized commit/PR titles to PR numbers.
 * Normalization removes Conventional Commit prefixes and lowercases titles.
 * Uses commit subjects and merge commit bodies extracted from `prsLog`.
 * @param commitList Commits to source subjects from.
 * @param prsLog Merge commit log used to read PR titles.
 * @param prMapBySha Mapping from commit SHA to PR numbers.
 * @returns Mapping from normalized title to the first PR number.
 */
export function buildTitleToPr(
  commitList: CommitLite[],
  prsLog: string,
  prMapBySha: PrNumbersBySha,
): Record<string, number> {
  const titleToPr: Record<string, number> = {};

  for (const commit of commitList) {
    const numbers = prMapBySha[commit.sha];
    if (!numbers?.length) continue;
    const normalized = normalizeTitle(commit.subject);
    if (normalized) titleToPr[normalized] = numbers[0];
  }

  // Map merged PR titles (from merge commit body) to PR numbers
  for (const line of prsLog.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [sha, ...rest] = trimmed.split(' ');
    if (!sha || rest.length === 0) continue;

    const normalized = normalizeTitle(rest.join(' '));
    const numbers = prMapBySha[sha];
    if (normalized && numbers?.length) {
      titleToPr[normalized] = numbers[0];
    }
  }

  return titleToPr;
}
