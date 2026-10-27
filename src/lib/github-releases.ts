import { GITHUB_API_BASE_DEFAULT } from '@/constants/github.js';
import { githubGet } from '@/lib/github-client.js';
import { GitHubReleaseByTagSchema } from '@/schema/github.js';
import type { MetadataLookupResult } from '@/types/github.js';
import { classifyGithubError } from '@/utils/github-error.js';

/**
 * Fetch a release body for a given tag, returning structured result with error discrimination.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param tag Tag identifying the release (e.g., "v1.2.3").
 * @param token Optional GitHub token for higher rate limits/private repos.
 * @param apiBase GitHub API base URL.
 * @returns Metadata lookup result containing release body markdown on success.
 */
export async function fetchReleaseBodyResult(
  owner: string,
  repo: string,
  tag: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<MetadataLookupResult<string>> {
  const endpoint = `${apiBase}/repos/${owner}/${repo}/releases/tags/${tag}`;
  try {
    const rawData = await githubGet<unknown>(endpoint, token);
    const parsed = GitHubReleaseByTagSchema.safeParse(rawData);
    if (!parsed.success) {
      return classifyGithubError(parsed.error, `Release tag ${tag}`);
    }
    return {
      status: 'success',
      data: parsed.data.body ?? '',
    };
  } catch (caughtError) {
    return classifyGithubError(caughtError, `Release tag ${tag}`);
  }
}

/**
 * Fetch a release body for a given tag.
 * Returns an empty string when the release is not found or on errors.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param tag Tag identifying the release (e.g., "v1.2.3").
 * @param token Optional GitHub token for higher rate limits/private repos.
 * @param apiBase GitHub API base URL.
 * @returns The release body markdown, or empty string if unavailable.
 */
export async function fetchReleaseBody(
  owner: string,
  repo: string,
  tag: string,
  token?: string,
  apiBase: string = GITHUB_API_BASE_DEFAULT,
): Promise<string> {
  const result = await fetchReleaseBodyResult(owner, repo, tag, token, apiBase);
  return result.status === 'success' ? result.data : '';
}
