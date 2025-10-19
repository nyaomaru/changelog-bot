/**
 * Resolve the GitHub repo full name (owner/repo) from environment.
 * Uses `REPO_FULL_NAME` or `GITHUB_REPOSITORY`. Exits when missing/invalid.
 * WHY: The CLI relies on a concrete repo to build compare links and PR URLs; we fail fast here.
 * @returns Repository slug in the form `owner/repo`.
 */
export function getRepoFullName(): string {
  const repoFull = process.env.REPO_FULL_NAME ?? process.env.GITHUB_REPOSITORY;
  if (!repoFull || !repoFull.includes('/')) {
    console.error(
      'REPO_FULL_NAME or GITHUB_REPOSITORY is required (owner/repo).'
    );
    process.exit(1);
  }
  return repoFull;
}
