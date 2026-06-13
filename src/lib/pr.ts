import { Octokit } from 'octokit';
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_CHANGELOG_FILE,
  EXEC_OPTS,
  GIT_REMOTE,
} from '@/constants/git.js';
import type { CreatePRParams } from '@/types/pr.js';

type GitArgs = readonly [string, ...string[]];
const INVALID_BRANCH_PUNCTUATION = ' ~^:?*[';

function runGit(args: GitArgs): void {
  execFileSync('git', args, EXEC_OPTS);
}

function hasInvalidBranchChars(branchName: string): boolean {
  for (const character of branchName) {
    const charCode = character.charCodeAt(0);
    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
    if (INVALID_BRANCH_PUNCTUATION.includes(character)) {
      return true;
    }
  }
  return false;
}

function assertSafeBranchName(branchName: string): void {
  if (!branchName) {
    throw new Error('Invalid branch name: branch name must not be empty.');
  }
  if (branchName.startsWith('-')) {
    throw new Error(
      'Invalid branch name: branch name must not start with "-".',
    );
  }
  if (
    branchName.startsWith('/') ||
    branchName.endsWith('/') ||
    branchName.includes('//') ||
    branchName.includes('..') ||
    branchName.includes('@{') ||
    branchName.includes('\\') ||
    branchName.endsWith('.') ||
    hasInvalidBranchChars(branchName)
  ) {
    throw new Error(`Invalid branch name: "${branchName}" is not a valid ref.`);
  }

  const branchSegments = branchName.split('/');
  if (
    branchSegments.some(
      (segment) =>
        !segment ||
        segment.startsWith('.') ||
        segment.endsWith('.lock') ||
        segment.endsWith('.'),
    )
  ) {
    throw new Error(`Invalid branch name: "${branchName}" is not a valid ref.`);
  }
}

function assertSafeChangelogPath(changelogPath: string): void {
  if (!changelogPath) {
    throw new Error('Invalid changelog path: path must not be empty.');
  }
  if (changelogPath.includes('\0')) {
    throw new Error('Invalid changelog path: null byte is not allowed.');
  }
}

/**
 * Create a pull request that commits the changelog and pushes a new branch.
 * WHY: Use simple git CLI steps for predictability and to respect local hooks,
 * then create the PR via Octokit and optionally apply labels.
 * @param params PR creation inputs including repo info, branch, title, and body.
 * @returns The created pull request number.
 */
export async function createPR(params: CreatePRParams) {
  const {
    owner,
    repo,
    baseBranch,
    branchName,
    title,
    body,
    labels,
    token,
    changelogEntry,
  } = params;
  const octokit = new Octokit({ auth: token });
  const changelogPath = changelogEntry || DEFAULT_CHANGELOG_FILE;

  // WHY: These values originate from CLI/config inputs. Rejecting unsafe branch
  // refs here and terminating `git add` option parsing below prevents values
  // like `--force` or `--all` from being interpreted as git flags.
  assertSafeBranchName(branchName);
  assertSafeChangelogPath(changelogPath);

  // WHY: Use argv arrays instead of shell strings so paths and titles with
  // whitespace or quotes are passed to Git without manual escaping. The `--`
  // terminator keeps Git from treating changelog paths like `--all` as options.
  const commands: GitArgs[] = [
    ['checkout', '-b', branchName],
    ['add', '--', changelogPath],
    ['commit', '-m', title],
    ['push', GIT_REMOTE, branchName],
  ];
  for (const commandArgs of commands) runGit(commandArgs);

  const pullRequest = await octokit.rest.pulls.create({
    owner,
    repo,
    base: baseBranch,
    head: branchName,
    title,
    body,
  });

  if (labels?.length) {
    // WHY: Labels are managed via the issues API; PRs are issues under the hood.
    // Missing `issues: write` should not make changelog PR creation fail.
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pullRequest.data.number,
        labels,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Failed to apply PR labels: ${message}`);
    }
  }
  return pullRequest.data.number;
}
