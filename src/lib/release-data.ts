import type { CliOptions } from '@/schema/cli.js';
import type { CommitLite } from '@/types/commit.js';
import type { MetadataDiagnostics, PullRef } from '@/types/github.js';
import type {
  currentBranch,
  tryFindPullRequestNumberForBranch,
} from '@/lib/git.js';
import type {
  fetchPullRequestsForBranch,
  fetchPullRequestsForBranchResult,
  fetchReleaseBody,
  fetchReleaseBodyResult,
  mapCommitsToPrs,
  mapCommitsToPrsWithDiagnostics,
} from '@/lib/github.js';
import { HEAD_REF } from '@/constants/git.js';
import {
  createMetadataDiagnostics,
  mergeMetadataDiagnostics,
  recordMetadataLookupOutcome,
} from '@/utils/metadata-diagnostics.js';
import { formatReleaseMetadataFallbackReason } from '@/utils/github-error.js';

/** Git and GitHub adapters used to associate commits with pull requests. */
export type PullRequestResolutionDependencies = {
  /** Read the currently checked-out branch name. */
  currentBranch: typeof currentBranch;
  /** Fetch open pull requests associated with a branch. */
  fetchPullRequestsForBranch: typeof fetchPullRequestsForBranch;
  /** Fetch open pull requests associated with a branch, returning structured result. */
  fetchPullRequestsForBranchResult?: typeof fetchPullRequestsForBranchResult;
  /** Resolve a branch PR number from remote git refs. */
  tryFindPullRequestNumberForBranch: typeof tryFindPullRequestNumberForBranch;
  /** Map individual commit SHAs to pull requests through GitHub. */
  mapCommitsToPrs: typeof mapCommitsToPrs;
  /** Map individual commit SHAs with structured lookup diagnostics. */
  mapCommitsToPrsWithDiagnostics?: typeof mapCommitsToPrsWithDiagnostics;
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

/** Result of resolving release commits to pull requests with associated lookup diagnostics. */
export type ResolvePullRequestsByShaResult = {
  /** Pull request references keyed by commit SHA. */
  pullRequestsBySha: Record<string, PullRef[]>;
  /** Diagnostics summarizing pull request lookups. */
  diagnostics: MetadataDiagnostics;
};

/**
 * Associate release commits with pull requests and preserve lookup diagnostics.
 * @param params Repository, release, commit, and lookup inputs.
 * @returns Pull request map and metadata diagnostics.
 */
export async function resolvePullRequestsByShaWithDiagnostics({
  deps,
  owner,
  repo,
  releaseRef,
  repoPath,
  token,
  githubApiBase,
  commitList,
}: ResolvePullRequestsByShaParams): Promise<ResolvePullRequestsByShaResult> {
  const commitShas = commitList.map((commit) => commit.sha);
  const branchName =
    releaseRef === HEAD_REF ? deps.currentBranch(repoPath) : null;
  const diagnostics = createMetadataDiagnostics();

  let branchPullRequests: PullRef[] = [];
  if (branchName) {
    if (deps.fetchPullRequestsForBranchResult) {
      const branchResult = await deps.fetchPullRequestsForBranchResult(
        owner,
        repo,
        branchName,
        token,
        githubApiBase,
      );
      recordMetadataLookupOutcome(diagnostics, branchResult);
      if (branchResult.status === 'success') {
        branchPullRequests = branchResult.data;
      }
    } else {
      branchPullRequests = await deps.fetchPullRequestsForBranch(
        owner,
        repo,
        branchName,
        token,
        githubApiBase,
      );
    }
  }

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
    return {
      pullRequestsBySha: Object.fromEntries(
        commitShas.map((commitSha) => [commitSha, authoritativePullRequests]),
      ),
      diagnostics,
    };
  }

  if (deps.mapCommitsToPrsWithDiagnostics) {
    const commitMapping = await deps.mapCommitsToPrsWithDiagnostics(
      owner,
      repo,
      commitShas,
      token,
      githubApiBase,
    );
    return {
      pullRequestsBySha: commitMapping.pullRequestsBySha,
      diagnostics: mergeMetadataDiagnostics(
        diagnostics,
        commitMapping.diagnostics,
      ),
    };
  }

  const pullRequestsBySha = await deps.mapCommitsToPrs(
    owner,
    repo,
    commitShas,
    token,
    githubApiBase,
  );
  return { pullRequestsBySha, diagnostics };
}

/**
 * Associate release commits with pull requests from branch metadata or the API.
 * WHY: A HEAD release may itself be a pull request. In that case its branch PR
 * is authoritative for every commit and avoids misleading per-commit matches.
 * @param params Repository, release, commit, and lookup inputs.
 * @returns Pull request references keyed by commit SHA.
 */
export async function resolvePullRequestsBySha(
  params: ResolvePullRequestsByShaParams,
): Promise<Record<string, PullRef[]>> {
  const result = await resolvePullRequestsByShaWithDiagnostics(params);
  return result.pullRequestsBySha;
}

/** GitHub adapter used to resolve release notes. */
export type ReleaseBodyDependencies = {
  /** Fetch GitHub release notes for a tag. */
  fetchReleaseBody: typeof fetchReleaseBody;
  /** Fetch GitHub release notes for a tag with structured lookup result. */
  fetchReleaseBodyResult?: typeof fetchReleaseBodyResult;
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

/** Result of resolving release notes with lookup diagnostics. */
export type ResolveReleaseBodyResult = {
  /** Release notes markdown body. */
  releaseBody: string;
  /** Diagnostics from the release notes metadata lookup. */
  diagnostics: MetadataDiagnostics;
};

/**
 * Resolve release notes and preserve lookup diagnostics.
 * @param params CLI, repository, and GitHub lookup inputs.
 * @returns Release notes body and metadata diagnostics.
 */
export async function resolveReleaseBodyWithDiagnostics(
  params: ResolveReleaseBodyParams,
): Promise<ResolveReleaseBodyResult> {
  const diagnostics = createMetadataDiagnostics();
  if (params.cli.releaseBody) {
    return { releaseBody: params.cli.releaseBody, diagnostics };
  }
  if (!params.cli.releaseTag) {
    return { releaseBody: '', diagnostics };
  }

  if (params.deps.fetchReleaseBodyResult) {
    const result = await params.deps.fetchReleaseBodyResult(
      params.owner,
      params.repo,
      params.cli.releaseTag,
      params.token,
      params.githubApiBase,
    );
    const fallbackReason =
      result.status !== 'success'
        ? formatReleaseMetadataFallbackReason(params.cli.releaseTag, result)
        : undefined;
    recordMetadataLookupOutcome(diagnostics, result, fallbackReason);
    return {
      releaseBody: result.status === 'success' ? result.data : '',
      diagnostics,
    };
  }

  const releaseBody = await params.deps.fetchReleaseBody(
    params.owner,
    params.repo,
    params.cli.releaseTag,
    params.token,
    params.githubApiBase,
  );
  return { releaseBody, diagnostics };
}

/**
 * Resolve release notes from the CLI first, then GitHub when a tag is present.
 * @param params CLI, repository, and GitHub lookup inputs.
 * @returns Release notes body, or an empty string when none can be resolved.
 */
export async function resolveReleaseBody(
  params: ResolveReleaseBodyParams,
): Promise<string> {
  const result = await resolveReleaseBodyWithDiagnostics(params);
  return result.releaseBody;
}
