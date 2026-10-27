export const GITHUB_ACCEPT = 'application/vnd.github+json';
export const GITHUB_API_VERSION = '2022-11-28';
export const PRS_LOOKUP_COMMIT_LIMIT = 200;

/**
 * Maximum concurrent GitHub metadata requests (commit-to-PR and PR details).
 * WHY: Concurrency of 4 yields ~3-4x latency reduction on releases with 15-30 PRs
 * while staying well within GitHub secondary rate limits and socket pools.
 */
export const GITHUB_METADATA_CONCURRENCY = 4;

export const GITHUB_API_BASE_DEFAULT = 'https://api.github.com';

// GitHub App JWT parameters
export const GITHUB_APP_JWT_SKEW_SECONDS = 60; // allow small clock drift
export const GITHUB_APP_JWT_TTL_SECONDS = 10 * 60; // 10 minutes per guidance
export const GITHUB_APP_JWT_ALG = 'RS256' as const; // JWT header alg
export const GITHUB_APP_SIGN_ALG = 'RSA-SHA256' as const; // node:crypto
