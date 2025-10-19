/** Parameters required to create a changelog pull request. */
export type CreatePRParams = {
  /** Repository owner or organization name. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Branch the changelog PR targets for merging. */
  baseBranch: string;
  /** Temporary branch name containing the changelog update. */
  branchName: string;
  /** Pull request title. */
  title: string;
  /** Pull request body including release notes. */
  body: string;
  /** Optional labels to apply when opening the PR. */
  labels?: string[];
  /** GitHub token used to authenticate API requests. */
  token: string;
  /** Markdown snippet to include in the initial PR comment. */
  changelogEntry: string;
};
