import { Octokit } from 'octokit';
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_CHANGELOG_FILE,
  EXEC_OPTS,
  GIT_REMOTE,
} from '@/constants/git.js';
import type { CreatePRParams } from '@/types/pr.js';

type GitArgs = readonly [string, ...string[]];

function runGit(args: GitArgs): void {
  execFileSync('git', args, EXEC_OPTS);
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

  // WHY: Use argv arrays instead of shell strings so paths and titles with
  // whitespace or quotes are passed to Git without manual escaping.
  const commands: GitArgs[] = [
    ['checkout', '-b', branchName],
    ['add', changelogPath],
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
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pullRequest.data.number,
      labels,
    });
  }
  return pullRequest.data.number;
}
