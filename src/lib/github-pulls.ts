import {
  GITHUB_API_BASE_DEFAULT,
  GITHUB_METADATA_CONCURRENCY,
  PRS_LOOKUP_COMMIT_LIMIT,
} from '@/constants/github.js';
import { githubGet } from '@/lib/github-client.js';
import {
  GitHubCommitPullsArraySchema,
  GitHubPRInfoSchema,
  type GitHubCommitPullsItemParsed,
  type GitHubPRInfoParsed,
} from '@/schema/github.js';
import type {
  MetadataDiagnostics,
  MetadataLookupResult,
  PullRef,
  PullRequestDetails,
} from '@/types/github.js';
import { mapConcurrent } from '@/utils/concurrency.js';
import {
  classifyGithubError,
  formatCommitMetadataFallbackReason,
} from '@/utils/github-error.js';
import {
  createMetadataDiagnostics,
  recordMetadataLookupOutcome,
} from '@/utils/metadata-diagnostics.js';

function toPullRef(pullRequest: GitHubCommitPullsItemParsed): PullRef {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    author: pullRequest.user?.login,
    url: pullRequest.html_url,
  };
}

async function fetchPullRequestData(
  owner: string,
  repo: string,
  number: number,
  token: string | undefined,
  apiBase: string,
): Promise<MetadataLookupResult<GitHubPRInfoParsed>> {
  const endpoint = `${apiBase}/repos/${owner}/${repo}/pulls/${number}`;
  try {
    const rawData = await githubGet<unknown>(endpoint, token);
    const parsed = GitHubPRInfoSchema.safeParse(rawData);
    if (!parsed.success) {
      return classifyGithubError(parsed.error, `PR #${number}`);
    }
    return {
      status: 'success',
      data: parsed.data,
    };
  } catch (caughtError) {
    return classifyGithubError(caughtError, `PR #${number}`);
  }
}

/**
 * Fetch minimal PR info (author and URL) by PR number.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param number PR number.
 * @param token Optional GitHub token.
 * @param apiBase GitHub API base URL.
 * @returns Lookup result with author and URL on success, or structured failure.
 */
export async function fetchPRInfo(
  owner: string,
  repo: string,
  number: number,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<MetadataLookupResult<{ author?: string; url?: string }>> {
  const result = await fetchPullRequestData(
    owner,
    repo,
    number,
    token,
    apiBase,
  );
  if (result.status !== 'success') {
    return result;
  }
  return {
    status: 'success',
    data: {
      author: result.data.user?.login,
      url: result.data.html_url,
    },
  };
}

/**
 * Fetch PR title, body, author, and URL by PR number.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param number PR number.
 * @param token Optional GitHub token.
 * @param apiBase GitHub API base URL.
 * @returns Lookup result with normalized PR details on success, or structured failure.
 */
export async function fetchPRDetails(
  owner: string,
  repo: string,
  number: number,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<MetadataLookupResult<PullRequestDetails>> {
  const result = await fetchPullRequestData(
    owner,
    repo,
    number,
    token,
    apiBase,
  );
  if (result.status !== 'success') {
    return result;
  }
  const pullRequest = result.data;
  return {
    status: 'success',
    data: {
      number: pullRequest.number ?? number,
      title: pullRequest.title ?? '',
      body: pullRequest.body ?? '',
      author: pullRequest.user?.login,
      url: pullRequest.html_url,
    },
  };
}

/**
 * Fetch open pull requests whose head matches a repository branch, returning a structured result.
 * @param owner Repository owner or organization.
 * @param repo Repository name.
 * @param branch Local branch name used as the pull request head.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @returns Matching pull request metadata result.
 */
export async function fetchPullRequestsForBranchResult(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<MetadataLookupResult<PullRef[]>> {
  const head = encodeURIComponent(`${owner}:${branch}`);
  const endpoint = `${apiBase}/repos/${owner}/${repo}/pulls?state=open&head=${head}&per_page=10`;
  try {
    const rawData = await githubGet<unknown>(endpoint, token);
    const parsed = GitHubCommitPullsArraySchema.safeParse(rawData);
    if (!parsed.success) {
      return classifyGithubError(parsed.error, `Branch ${branch} PRs`);
    }
    return {
      status: 'success',
      data: parsed.data.map(toPullRef),
    };
  } catch (caughtError) {
    return classifyGithubError(caughtError, `Branch ${branch} PRs`);
  }
}

/**
 * Fetch open pull requests whose head matches a repository branch.
 * @param owner Repository owner or organization.
 * @param repo Repository name.
 * @param branch Local branch name used as the pull request head.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @returns Matching pull request metadata, or an empty array on failure.
 */
export async function fetchPullRequestsForBranch(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<PullRef[]> {
  const result = await fetchPullRequestsForBranchResult(
    owner,
    repo,
    branch,
    token,
    apiBase,
  );
  return result.status === 'success' ? result.data : [];
}

/**
 * List pull requests associated with a commit SHA, returning a structured lookup result.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param sha Commit SHA to inspect.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @returns Structured metadata lookup result containing associated pull requests.
 */
export async function prsForCommitData(
  owner: string,
  repo: string,
  sha: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<MetadataLookupResult<PullRef[]>> {
  const endpoint = `${apiBase}/repos/${owner}/${repo}/commits/${sha}/pulls`;
  try {
    const rawData = await githubGet<unknown>(endpoint, token);
    const parsed = GitHubCommitPullsArraySchema.safeParse(rawData);
    if (!parsed.success) {
      return classifyGithubError(parsed.error, `Commit ${sha.slice(0, 7)} PRs`);
    }
    return {
      status: 'success',
      data: parsed.data.map(toPullRef),
    };
  } catch (caughtError) {
    return classifyGithubError(caughtError, `Commit ${sha.slice(0, 7)} PRs`);
  }
}

/**
 * List pull requests associated with a commit SHA.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param sha Commit SHA to inspect.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @returns Pull requests associated with the commit.
 */
export async function prsForCommit(
  owner: string,
  repo: string,
  sha: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<PullRef[]> {
  const result = await prsForCommitData(owner, repo, sha, token, apiBase);
  return result.status === 'success' ? result.data : [];
}

/** Result of mapping commits to pull requests with associated lookup diagnostics. */
export type MapCommitsToPrsResult = {
  /** Pull request lists keyed by commit SHA. */
  pullRequestsBySha: Record<string, PullRef[]>;
  /** Diagnostics summarizing commit metadata lookups. */
  diagnostics: MetadataDiagnostics;
};

/**
 * Map commit SHAs to associated pull requests with bounded concurrency and diagnostics.
 * WHY: Cap requests and bound concurrency to keep API usage predictable while
 * preserving typed failure diagnostics for dry-run reporting.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param shas Commit SHAs to inspect.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @param concurrency Maximum concurrent requests; defaults to GITHUB_METADATA_CONCURRENCY.
 * @returns Mapped pull requests and aggregated lookup diagnostics.
 */
export async function mapCommitsToPrsWithDiagnostics(
  owner: string,
  repo: string,
  shas: string[],
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
  concurrency = GITHUB_METADATA_CONCURRENCY,
): Promise<MapCommitsToPrsResult> {
  const targetShas = shas.slice(0, PRS_LOOKUP_COMMIT_LIMIT);
  const diagnostics = createMetadataDiagnostics();

  const pullRefEntries = await mapConcurrent(
    targetShas,
    concurrency,
    async (
      commitSha,
    ): Promise<readonly [string, MetadataLookupResult<PullRef[]>]> => {
      const lookupResult = await prsForCommitData(
        owner,
        repo,
        commitSha,
        token,
        apiBase,
      );
      return [commitSha, lookupResult];
    },
  );

  const pullRequestsBySha: Record<string, PullRef[]> = {};
  for (const [commitSha, lookupResult] of pullRefEntries) {
    const fallbackReason =
      lookupResult.status !== 'success'
        ? formatCommitMetadataFallbackReason(commitSha, lookupResult)
        : undefined;
    recordMetadataLookupOutcome(diagnostics, lookupResult, fallbackReason);

    pullRequestsBySha[commitSha] =
      lookupResult.status === 'success' ? lookupResult.data : [];
  }

  return { pullRequestsBySha, diagnostics };
}

/**
 * Map commit SHAs to associated pull requests with bounded concurrency.
 * WHY: Preserves backward-compatible signature for callers expecting a simple map.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param shas Commit SHAs to inspect.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @param concurrency Maximum concurrent requests; defaults to GITHUB_METADATA_CONCURRENCY.
 * @returns Map of commit SHA to associated pull requests.
 */
export async function mapCommitsToPrs(
  owner: string,
  repo: string,
  shas: string[],
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
  concurrency = GITHUB_METADATA_CONCURRENCY,
): Promise<Record<string, PullRef[]>> {
  const { pullRequestsBySha } = await mapCommitsToPrsWithDiagnostics(
    owner,
    repo,
    shas,
    token,
    apiBase,
    concurrency,
  );
  return pullRequestsBySha;
}
