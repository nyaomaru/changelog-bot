import type { ProviderName } from '@/types/llm.js';

/** Runtime configuration for a single LLM provider. */
export type ProviderRuntimeConfig = {
  /** API key used to authorize requests. */
  apiKey?: string;
  /** Concrete model identifier resolved for the run. */
  model: string;
};

/** Provider configuration map keyed by provider name. */
export type ProviderRuntimeConfigMap = Record<
  ProviderName,
  ProviderRuntimeConfig
>;

/** Runtime configuration for GitHub and repository integration. */
export type GitHubRuntimeConfig = {
  /** Personal access token used for GitHub API calls when present. */
  token?: string;
  /** GitHub App id used when PAT auth is unavailable. */
  appId?: string;
  /** GitHub App private key in PEM format. */
  appPrivateKey?: string;
  /** Optional GitHub App installation id override. */
  appInstallationId?: string;
  /** GitHub or GHES API base URL. */
  apiBase: string;
  /** Repository slug in `owner/repo` format when known. */
  repoFullName?: string;
};

/** Runtime configuration resolved once per CLI invocation. */
export type AppConfig = {
  /** GitHub API, auth, and repository settings. */
  github: GitHubRuntimeConfig;
  /** Provider API keys and model names. */
  providers: ProviderRuntimeConfigMap;
};
