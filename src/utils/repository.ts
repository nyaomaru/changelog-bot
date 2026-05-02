import type { AppConfig } from '@/types/config.js';

/**
 * Resolve the GitHub repo full name (owner/repo) from runtime config.
 * WHY: The CLI relies on a concrete repo to build compare links and PR URLs; we fail fast here.
 * @param appConfig Runtime configuration for the current invocation.
 * @returns Repository slug in the form `owner/repo`.
 */
export function getRepoFullName(appConfig: AppConfig): string {
  const repoFull = appConfig.github.repoFullName;
  if (!repoFull || !repoFull.includes('/')) {
    console.error(
      'REPO_FULL_NAME or GITHUB_REPOSITORY is required (owner/repo).',
    );
    process.exit(1);
  }
  return repoFull;
}
