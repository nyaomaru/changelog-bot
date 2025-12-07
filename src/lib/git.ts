import { execFileSync } from 'node:child_process';
import { HEAD_REF } from '@/constants/git.js';

/**
 * Pattern that whitelists simple tag or branch names (alphanumeric plus ._-).
 */
const SAFE_REF_PATTERN = /^[A-Za-z0-9._-]+$/;
/**
 * Pattern that whitelists Git shas (7-40 hex characters).
 */
const SAFE_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Ensure a Git ref or tag does not contain characters that could be used to
 * escape argument boundaries when invoking Git.
 * @param value Git ref/tag supplied by a user or CLI flag.
 * @param label Descriptive label for the thrown error.
 */
function assertSafeGitRef(value: string, label: string): void {
  if (!SAFE_REF_PATTERN.test(value) && !SAFE_SHA_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${label}: "${value}" contains unsupported characters.`
    );
  }
}

/**
 * Ensure a filesystem path is safe for passing to Git CLI arguments.
 * @param value Path supplied by a user or CLI flag.
 * @param label Descriptive label for the thrown error.
 */
function assertSafePath(value: string, label: string): void {
  if (value.includes('\0')) {
    throw new Error(`Invalid ${label}: null byte is not allowed.`);
  }
}

/**
 * Run a Git command synchronously and return stdout as UTF-8.
 * @param args Git CLI arguments; command is executed without a shell.
 * @param cwd Optional working directory.
 * @returns Trimmed stdout string.
 */
export function run(args: readonly string[], cwd?: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}
/**
 * Run a command and return null on failure instead of throwing.
 * @param args Git CLI arguments; command is executed without a shell.
 * @param cwd Optional working directory.
 * @returns Trimmed stdout string or null on error.
 */
export function tryRun(args: readonly string[], cwd?: string): string | null {
  try {
    return run(args, cwd);
  } catch {
    return null;
  }
}

/** Detect the latest tag, or null when none. */
export function tryDetectLatestTag(cwd?: string): string | null {
  return tryRun(['describe', '--tags', '--abbrev=0'], cwd);
}
/** Detect the previous tag relative to the given tag. */
export function tryDetectPrevTag(
  currentTag: string,
  cwd?: string
): string | null {
  assertSafeGitRef(currentTag, 'current tag');
  return tryRun(['describe', '--tags', '--abbrev=0', `${currentTag}^`], cwd);
}

/** Get the first commit SHA in the repository. */
export function firstCommit(cwd?: string): string {
  const list = run(['rev-list', '--max-parents=0', HEAD_REF], cwd).split('\n');
  return list[list.length - 1].trim();
}

/** Git log of merge commits with body: used to infer merged PRs. */
export function gitMergedPRs(from: string, to: string, cwd?: string): string {
  assertSafeGitRef(from, 'from ref');
  assertSafeGitRef(to, 'to ref');
  return run(
    ['log', '--merges', '--pretty=format:%H %b', `${from}..${to}`],
    cwd
  );
}

/** List commit SHAs contained in a merge commit (parent1..parent2 range). */
export function commitsFromMerge(mergeSha: string, cwd?: string): string[] {
  assertSafeGitRef(mergeSha, 'merge sha');
  return run(['rev-list', `${mergeSha}^1..${mergeSha}^2`], cwd)
    .split('\n')
    .filter(Boolean);
}

/**
 * Enumerate commits in a range with full SHA and subject.
 * @returns Array of `{ sha, subject }` objects.
 */
export function commitsInRange(prev: string, next: string, repoPath = '.') {
  assertSafeGitRef(prev, 'previous ref');
  assertSafeGitRef(next, 'next ref');
  assertSafePath(repoPath, 'repository path');
  const logOutput = run([
    '-C',
    repoPath,
    'log',
    `${prev}..${next}`,
    '--pretty=format:%H%x09%s',
  ]);
  return logOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split('\t');
      return { sha, subject };
    });
}

/**
 * Get the commit date (YYYY-MM-DD) for a given ref/tag.
 * WHY: Use the release/tag commit date for the changelog entry instead of the generation time.
 * @param ref Git ref or tag (e.g., a tag like "v1.2.3" or a SHA).
 * @param cwd Optional working directory for the git command.
 * @returns Date string in YYYY-MM-DD format, or null when unavailable.
 */
export function dateForRef(ref: string, cwd?: string): string | null {
  assertSafeGitRef(ref, 'ref');
  // %cs is the committer date in YYYY-MM-DD; --date=short ensures format for older git versions
  return tryRun(['show', '-s', '--date=short', '--format=%cs', ref], cwd);
}

/**
 * Extract PR numbers (e.g., "#123") from text.
 * @returns Numeric PR identifiers (deduped).
 */
export function extractPrRefsFromText(text: string): number[] {
  const numbers = new Set<number>();
  const regExp = /#(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regExp.exec(text)) !== null) {
    numbers.add(Number(match[1]));
  }
  return [...numbers];
}
