import { execSync } from 'node:child_process';
import { HEAD_REF } from '@/constants/git.js';

/**
 * Run a command synchronously and return stdout as UTF-8.
 * @param cmd Shell command to execute.
 * @param cwd Optional working directory.
 * @returns Trimmed stdout string.
 */
export function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: 'utf8', cwd }).trim();
}
/**
 * Run a command and return null on failure instead of throwing.
 * @param cmd Shell command to execute.
 * @param cwd Optional working directory.
 * @returns Trimmed stdout string or null on error.
 */
export function tryRun(cmd: string, cwd?: string): string | null {
  try {
    return run(cmd, cwd);
  } catch {
    return null;
  }
}

/** Detect the latest tag, or null when none. */
export function tryDetectLatestTag(cwd?: string): string | null {
  return tryRun('git describe --tags --abbrev=0', cwd);
}
/** Detect the previous tag relative to the given tag. */
export function tryDetectPrevTag(
  currentTag: string,
  cwd?: string
): string | null {
  return tryRun(`git describe --tags --abbrev=0 ${currentTag}^`, cwd);
}

/** Get the first commit SHA in the repository. */
export function firstCommit(cwd?: string): string {
  const list = run(`git rev-list --max-parents=0 ${HEAD_REF}`, cwd).split('\n');
  return list[list.length - 1].trim();
}

/** Git log in short format: `<short-sha> <subject>` per line. */
export function gitLog(from: string, to: string, cwd?: string): string {
  return run(`git log --pretty=format:"%h %s" ${from}..${to}`, cwd);
}
/** Git log of merge commits with body: used to infer merged PRs. */
export function gitMergedPRs(from: string, to: string, cwd?: string): string {
  return run(`git log --merges --pretty=format:"%H %b" ${from}..${to}`, cwd);
}

/** List commit SHAs contained in a merge commit (parent1..parent2 range). */
export function commitsFromMerge(mergeSha: string, cwd?: string): string[] {
  return run(`git rev-list ${mergeSha}^1..${mergeSha}^2`, cwd)
    .split('\n')
    .filter(Boolean);
}

/**
 * Enumerate commits in a range with full SHA and subject.
 * @returns Array of `{ sha, subject }` objects.
 */
export function commitsInRange(prev: string, next: string, repoPath = '.') {
  const logOutput = execSync(
    `git -C ${repoPath} log ${prev}..${next} --pretty=format:"%H%x09%s"`,
    { encoding: 'utf8' }
  );
  return logOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split('\t');
      return { sha, subject };
    });
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
