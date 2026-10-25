import {
  GITHUB_API_BASE_DEFAULT,
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
  MetadataLookupResult,
  PullRef,
  PullRequestDetails,
} from '@/types/github.js';
import { classifyGithubError } from '@/utils/github-error.js';

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
  const head = encodeURIComponent(`${owner}:${branch}`);
  const endpoint = `${apiBase}/repos/${owner}/${repo}/pulls?state=open&head=${head}&per_page=10`;
  try {
    const data = await githubGet<unknown>(endpoint, token);
    const parsed = GitHubCommitPullsArraySchema.safeParse(data);
    return parsed.success ? parsed.data.map(toPullRef) : [];
  } catch {
    return [];
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
  const endpoint = `${apiBase}/repos/${owner}/${repo}/commits/${sha}/pulls`;
  const data = await githubGet<unknown>(endpoint, token);
  const parsed = GitHubCommitPullsArraySchema.safeParse(data);
  return parsed.success ? parsed.data.map(toPullRef) : [];
}

/**
 * Map commit SHAs to associated pull requests.
 * WHY: Cap requests to keep API usage and runtime predictable.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param shas Commit SHAs to inspect.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @param apiBase GitHub API base URL.
 * @returns Map of commit SHA to associated pull requests.
 */
export async function mapCommitsToPrs(
  owner: string,
  repo: string,
  shas: string[],
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<Record<string, PullRef[]>> {
  const commitToPullRefs: Record<string, PullRef[]> = {};
  for (const commitSha of shas.slice(0, PRS_LOOKUP_COMMIT_LIMIT)) {
    try {
      commitToPullRefs[commitSha] = await prsForCommit(
        owner,
        repo,
        commitSha,
        token,
        apiBase,
      );
    } catch {
      commitToPullRefs[commitSha] = [];
    }
  }
  return commitToPullRefs;
}
