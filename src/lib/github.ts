import type { PullRef, PullRequestDetails } from '@/types/github.js';
import {
  GitHubReleaseByTagSchema,
  GitHubPRInfoSchema,
  GitHubCommitPullsArraySchema,
} from '@/schema/github.js';
import {
  GITHUB_ACCEPT,
  GITHUB_API_BASE_DEFAULT,
  GITHUB_API_VERSION,
  PRS_LOOKUP_COMMIT_LIMIT,
} from '@/constants/github.js';
import { getJson } from '@/utils/http.js';

/**
 * Perform a GitHub API GET request with standard headers.
 * WHY: Centralize headers (accept + version) to keep call sites minimal.
 * @param url Full GitHub REST endpoint.
 * @param token Optional bearer token; adds Authorization header when present.
 * @returns Parsed JSON as the requested type.
 */
async function ghGet<T>(url: string, token?: string): Promise<T> {
  const requestHeaders: Record<string, string> = {
    Accept: GITHUB_ACCEPT,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  return getJson<T>(url, requestHeaders, 'GitHub API');
}

/**
 * Fetch a release body for a given tag.
 * Returns an empty string when the release is not found or on errors.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param tag Tag identifying the release (e.g., "v1.2.3").
 * @param token Optional GitHub token for higher rate limits/private repos.
 * @returns The release body markdown, or empty string if unavailable.
 */
export async function fetchReleaseBody(
  owner: string,
  repo: string,
  tag: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<string> {
  // GET /repos/{owner}/{repo}/releases/tags/{tag}
  const endpoint = `${apiBase}/repos/${owner}/${repo}/releases/tags/${tag}`;
  try {
    const data = await ghGet<unknown>(endpoint, token);
    const parsed = GitHubReleaseByTagSchema.safeParse(data);
    if (!parsed.success) return '';
    return parsed.data.body ?? '';
  } catch {
    return '';
  }
}

/**
 * Fetch minimal PR info (author and URL) by PR number.
 * Returns null if the PR is not accessible or parsing fails.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param number PR number.
 * @param token Optional GitHub token.
 */
export async function fetchPRInfo(
  owner: string,
  repo: string,
  number: number,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<{ author?: string; url?: string } | null> {
  const endpoint = `${apiBase}/repos/${owner}/${repo}/pulls/${number}`;
  try {
    const data = await ghGet<unknown>(endpoint, token);
    const parsed = GitHubPRInfoSchema.safeParse(data);
    if (!parsed.success) return null;
    return {
      author: parsed.data.user?.login,
      url: parsed.data.html_url,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch PR title, body, author, and URL by PR number.
 * Returns null if the PR is not accessible or parsing fails.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param number PR number.
 * @param token Optional GitHub token.
 * @param apiBase GitHub API base URL.
 * @returns Normalized PR details, or null when unavailable.
 */
export async function fetchPRDetails(
  owner: string,
  repo: string,
  number: number,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<PullRequestDetails | null> {
  const endpoint = `${apiBase}/repos/${owner}/${repo}/pulls/${number}`;
  try {
    const data = await ghGet<unknown>(endpoint, token);
    const parsed = GitHubPRInfoSchema.safeParse(data);
    if (!parsed.success) return null;
    return {
      number: parsed.data.number ?? number,
      title: parsed.data.title ?? '',
      body: parsed.data.body ?? '',
      author: parsed.data.user?.login,
      url: parsed.data.html_url,
    };
  } catch {
    return null;
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
  const head = encodeURIComponent(`${owner}:${branch}`);
  const endpoint = `${apiBase}/repos/${owner}/${repo}/pulls?state=open&head=${head}&per_page=10`;
  try {
    const data = await ghGet<unknown>(endpoint, token);
    const parsed = GitHubCommitPullsArraySchema.safeParse(data);
    if (!parsed.success) return [];
    return parsed.data.map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title,
      author: pullRequest.user?.login,
      url: pullRequest.html_url,
    }));
  } catch {
    return [];
  }
}

/**
 * For squash/rebase merges: list PRs associated with a commit.
 * Uses the GitHub endpoint that back-references PRs from a commit SHA.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param sha Commit SHA to inspect.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @returns Array of PullRef containing PR number and title.
 */
export async function prsForCommit(
  owner: string,
  repo: string,
  sha: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<PullRef[]> {
  // GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls
  const endpoint = `${apiBase}/repos/${owner}/${repo}/commits/${sha}/pulls`;
  const data = await ghGet<unknown>(endpoint, token);
  const parsed = GitHubCommitPullsArraySchema.safeParse(data);
  const pullRequests = parsed.success ? parsed.data : [];
  return pullRequests.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login,
    url: pr.html_url,
  }));
}

/**
 * Batch map of commits to PR refs: sha -> PullRef[] (deduping handled upstream).
 * WHY: Cap the number of requests to `PRS_LOOKUP_COMMIT_LIMIT` to avoid
 * exceeding API rate limits and keep runtime predictable.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param shas List of commit SHAs.
 * @param token Optional GitHub token for private repositories and higher limits.
 * @returns Map of commit SHA to associated PR refs (number and title).
 */
export async function mapCommitsToPrs(
  owner: string,
  repo: string,
  shas: string[],
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<Record<string, PullRef[]>> {
  const commitToPullRefs: Record<string, PullRef[]> = {};
  for (const sha of shas.slice(0, PRS_LOOKUP_COMMIT_LIMIT)) {
    try {
      commitToPullRefs[sha] = await prsForCommit(
        owner,
        repo,
        sha,
        token,
        apiBase,
      );
    } catch {
      commitToPullRefs[sha] = [];
    }
  }
  return commitToPullRefs;
}
