import { Octokit } from 'octokit';
import { execSync } from 'node:child_process';
import { escapeQuotes } from '@/utils/escape.js';
import {
  DEFAULT_CHANGELOG_FILE,
  EXEC_OPTS,
  GIT_REMOTE,
} from '@/constants/git.js';
import type { CreatePRParams } from '@/types/pr.js';

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

  // WHY: Keep the sequence explicit and linear; escape commit message quotes.
  const commands = [
    `git checkout -b ${branchName}`,
    `git add ${changelogPath}`,
    `git commit -m "${escapeQuotes(title)}"`,
    `git push ${GIT_REMOTE} ${branchName}`,
  ];
  for (const command of commands) execSync(command, EXEC_OPTS);

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
