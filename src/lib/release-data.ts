import type { CliOptions } from '@/schema/cli.js';
import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type {
  currentBranch,
  tryFindPullRequestNumberForBranch,
} from '@/lib/git.js';
import type {
  fetchPullRequestsForBranch,
  fetchReleaseBody,
  mapCommitsToPrs,
} from '@/lib/github.js';
import { HEAD_REF } from '@/constants/git.js';

/** Git and GitHub adapters used to associate commits with pull requests. */
export type PullRequestResolutionDependencies = {
  /** Read the currently checked-out branch name. */
  currentBranch: typeof currentBranch;
  /** Fetch open pull requests associated with a branch. */
  fetchPullRequestsForBranch: typeof fetchPullRequestsForBranch;
  /** Resolve a branch PR number from remote git refs. */
  tryFindPullRequestNumberForBranch: typeof tryFindPullRequestNumberForBranch;
  /** Map individual commit SHAs to pull requests through GitHub. */
  mapCommitsToPrs: typeof mapCommitsToPrs;
};

/** Inputs used to associate release commits with pull requests. */
export type ResolvePullRequestsByShaParams = {
  /** Git and GitHub adapters used for pull request lookups. */
  deps: PullRequestResolutionDependencies;
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Release ref selected for this run. */
  releaseRef: string;
  /** Local repository path used for git commands. */
  repoPath: string;
  /** GitHub API token, when available. */
  token?: string;
  /** GitHub or GHES API base URL. */
  githubApiBase: string;
  /** Commits included in the release range. */
  commitList: CommitLite[];
};

/**
 * Associate release commits with pull requests from branch metadata or the API.
 * WHY: A HEAD release may itself be a pull request. In that case its branch PR
 * is authoritative for every commit and avoids misleading per-commit matches.
 * @param params Repository, release, commit, and lookup inputs.
 * @returns Pull request references keyed by commit SHA.
 */
export async function resolvePullRequestsBySha({
  deps,
  owner,
  repo,
  releaseRef,
  repoPath,
  token,
  githubApiBase,
  commitList,
}: ResolvePullRequestsByShaParams): Promise<Record<string, PullRef[]>> {
  const commitShas = commitList.map((commit) => commit.sha);
  const branchName =
    releaseRef === HEAD_REF ? deps.currentBranch(repoPath) : null;
  const branchPullRequests = branchName
    ? await deps.fetchPullRequestsForBranch(
        owner,
        repo,
        branchName,
        token,
        githubApiBase,
      )
    : [];
  const remotePrNumber =
    branchName && branchPullRequests.length === 0
      ? deps.tryFindPullRequestNumberForBranch(branchName, repoPath)
      : null;
  const oldestCommit = commitList[commitList.length - 1];
  const remotePullRequest =
    remotePrNumber && oldestCommit
      ? {
          number: remotePrNumber,
          title: oldestCommit.subject,
          url: `https://github.com/${owner}/${repo}/pull/${remotePrNumber}`,
        }
      : null;
  const authoritativePullRequests = branchPullRequests.length
    ? branchPullRequests
    : remotePullRequest
      ? [remotePullRequest]
      : [];

  if (authoritativePullRequests.length) {
    return Object.fromEntries(
      commitShas.map((commitSha) => [commitSha, authoritativePullRequests]),
    );
  }

  return deps.mapCommitsToPrs(owner, repo, commitShas, token, githubApiBase);
}

/** GitHub adapter used to resolve release notes. */
export type ReleaseBodyDependencies = {
  /** Fetch GitHub release notes for a tag. */
  fetchReleaseBody: typeof fetchReleaseBody;
};

/** Inputs used to resolve release notes for changelog generation. */
export type ResolveReleaseBodyParams = {
  /** Parsed CLI options. */
  cli: CliOptions;
  /** GitHub adapter used for release lookups. */
  deps: ReleaseBodyDependencies;
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** GitHub API token, when available. */
  token?: string;
  /** GitHub or GHES API base URL. */
  githubApiBase: string;
};

/**
 * Resolve release notes from the CLI first, then GitHub when a tag is present.
 * @param params CLI, repository, and GitHub lookup inputs.
 * @returns Release notes body, or an empty string when none can be resolved.
 */
export async function resolveReleaseBody(
  params: ResolveReleaseBodyParams,
): Promise<string> {
  if (params.cli.releaseBody) return params.cli.releaseBody;
  if (!params.cli.releaseTag) return '';

  return params.deps.fetchReleaseBody(
    params.owner,
    params.repo,
    params.cli.releaseTag,
    params.token,
    params.githubApiBase,
  );
}
