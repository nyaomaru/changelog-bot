export const GITHUB_ACCEPT = 'application/vnd.github+json';
export const GITHUB_API_VERSION = '2022-11-28';
export const PRS_LOOKUP_COMMIT_LIMIT = 200;

// API base; override for GHES via env
export const GITHUB_API_BASE_DEFAULT = 'https://api.github.com';
export const GITHUB_API_BASE =
  process.env.GITHUB_API_BASE || GITHUB_API_BASE_DEFAULT;

// GitHub App JWT parameters
export const GITHUB_APP_JWT_SKEW_SECONDS = 60; // allow small clock drift
export const GITHUB_APP_JWT_TTL_SECONDS = 10 * 60; // 10 minutes per guidance
export const GITHUB_APP_JWT_ALG = 'RS256' as const; // JWT header alg
export const GITHUB_APP_SIGN_ALG = 'RSA-SHA256' as const; // node:crypto
