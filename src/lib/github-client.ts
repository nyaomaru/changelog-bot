import { GITHUB_ACCEPT, GITHUB_API_VERSION } from '@/constants/github.js';
import { getJson } from '@/utils/http.js';

/**
 * Perform a GitHub API GET request with the headers required by the REST API.
 * WHY: Release and pull-request modules share the same transport contract;
 * centralizing it prevents authentication and API-version drift.
 * @param url Full GitHub REST endpoint.
 * @param token Optional bearer token for private repositories and higher limits.
 * @returns Parsed JSON as the requested type.
 */
export async function githubGet<T>(url: string, token?: string): Promise<T> {
  const requestHeaders: Record<string, string> = {
    Accept: GITHUB_ACCEPT,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  return getJson<T>(url, requestHeaders, 'GitHub API');
}
