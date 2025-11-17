/** Minimal PR reference used when mapping commits to pull requests. */
export type PullRef = {
  /** Numeric PR identifier. */
  number: number;
  /** Optional pull request title for display. */
  title?: string;
};

// Minimal shapes for GitHub API responses we consume

/** GitHub release payload fetched by tag lookups. */
export type GitHubReleaseByTagResponse = {
  /** Markdown body of the release notes. */
  body?: string;
};

/** Subset of PR response fields we care about when enriching changelog entries. */
export type GitHubPRInfoResponse = {
  /** Author object containing the PR creator login. */
  user?: {
    /** GitHub login/username for the PR author. */
    login?: string;
  };
  /** HTML URL of the pull request. */
  html_url?: string;
};

/** Item returned when listing PRs associated with a commit. */
export type GitHubCommitPullsItem = {
  /** Numeric PR identifier. */
  number: number;
  /** Optional pull request title for reference. */
  title?: string;
};

/**
 * Token provenance used by GitHub authentication resolver.
 * 'pat' when using a personal/access token; 'app' when using a GitHub App installation token.
 */
export type TokenSource = 'pat' | 'app';

/**
 * Result of resolving a GitHub token for API/PR operations.
 * When source is 'app', includes the ISO expiration of the short‑lived installation token.
 */
export type GitHubAuth = {
  /** Bearer token used for GitHub REST/Octokit calls. */
  token: string;
  /** Origin of the token ('pat' | 'app'). */
  source: TokenSource;
  /** ISO timestamp when the token expires (only for App tokens). */
  expiresAt?: string;
};
