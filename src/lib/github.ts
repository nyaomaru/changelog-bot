import type { PullRef } from '@/types/github.js';
import {
  GitHubReleaseByTagSchema,
  GitHubPRInfoSchema,
  GitHubCommitPullsArraySchema,
} from '@/schema/github.js';
import {
  GITHUB_ACCEPT,
  GITHUB_API_VERSION,
  PRS_LOOKUP_COMMIT_LIMIT,
} from '@/constants/github.js';
import { getJson } from '@/utils/http.js';
import { GITHUB_API_BASE as API_BASE } from '@/constants/github.js';

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
  token?: string
): Promise<string> {
  // GET /repos/{owner}/{repo}/releases/tags/{tag}
  const endpoint = `${API_BASE}/repos/${owner}/${repo}/releases/tags/${tag}`;
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
  token?: string
): Promise<{ author?: string; url?: string } | null> {
  const endpoint = `${API_BASE}/repos/${owner}/${repo}/pulls/${number}`;
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
 * For squash/rebase merges: list PRs associated with a commit.
 * Uses the GitHub endpoint that back-references PRs from a commit SHA.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param sha Commit SHA to inspect.
 * @param token GitHub token (required by the endpoint for cross-repo parity).
 * @returns Array of PullRef containing PR number and title.
 */
export async function prsForCommit(
  owner: string,
  repo: string,
  sha: string,
  token: string
): Promise<PullRef[]> {
  // GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls
  const endpoint = `${API_BASE}/repos/${owner}/${repo}/commits/${sha}/pulls`;
  const data = await ghGet<unknown>(endpoint, token);
  const parsed = GitHubCommitPullsArraySchema.safeParse(data);
  const pullRequests = parsed.success ? parsed.data : [];
  return pullRequests.map((pr) => ({
    number: pr.number,
    title: pr.title,
  }));
}

/**
 * Batch map of commits to PR refs: sha -> PullRef[] (deduping handled upstream).
 * WHY: Cap the number of requests to `PRS_LOOKUP_COMMIT_LIMIT` to avoid
 * exceeding API rate limits and keep runtime predictable.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param shas List of commit SHAs.
 * @param token GitHub token to authorize requests.
 * @returns Map of commit SHA to associated PR refs (number and title).
 */
export async function mapCommitsToPrs(
  owner: string,
  repo: string,
  shas: string[],
  token: string
): Promise<Record<string, PullRef[]>> {
  const commitToPullRefs: Record<string, PullRef[]> = {};
  for (const sha of shas.slice(0, PRS_LOOKUP_COMMIT_LIMIT)) {
    try {
      commitToPullRefs[sha] = await prsForCommit(owner, repo, sha, token);
    } catch {
      commitToPullRefs[sha] = [];
    }
  }
  return commitToPullRefs;
}
