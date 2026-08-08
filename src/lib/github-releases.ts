import { GITHUB_API_BASE_DEFAULT } from '@/constants/github.js';
import { githubGet } from '@/lib/github-client.js';
import { GitHubReleaseByTagSchema } from '@/schema/github.js';

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
  const endpoint = `${apiBase}/repos/${owner}/${repo}/releases/tags/${tag}`;
  try {
    const data = await githubGet<unknown>(endpoint, token);
    const parsed = GitHubReleaseByTagSchema.safeParse(data);
    if (!parsed.success) return '';
    return parsed.data.body ?? '';
  } catch {
    return '';
  }
}
