import type { ProviderRuntimeConfig } from '@/types/config.js';
import type { CommitLite } from '@/types/commit.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';

/** Mapping from normalized title to pull request number. */
export type TitleToPrMap = Record<string, number>;

/** Mapping from commit SHA to attached pull request numbers. */
export type PrNumbersBySha = Record<string, number[]>;

/** Inputs required to build changelog output from release data and git history. */
export type BuildChangelogLlmOutputParams = {
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Release version without the leading `v`. */
  version: string;
  /** Release date in `YYYY-MM-DD` format. */
  date: string;
  /** Current release ref or tag. */
  releaseRef: string;
  /** Previous release ref or first commit. */
  prevRef: string;
  /** Release notes body fetched from GitHub or provided by CLI. */
  releaseBody: string;
  /** Output language requested for generated changelog text. */
  language: string;
  /** Optional user-provided writing and grouping guidance. */
  customInstructions?: string;
  /** Existing changelog content before the update. */
  existingChangelog: string;
  /** Commits included in the current release range. */
  commitList: CommitLite[];
  /** Merge-commit log used for fallback generation. */
  prs: string;
  /** Pull request numbers keyed by commit SHA. */
  prMapBySha: PrNumbersBySha;
  /** Pull request numbers keyed by normalized title. */
  titleToPr: TitleToPrMap;
  /** Provider used for full changelog generation. */
  provider: Provider;
  /** Provider API key and model config used for title classification. */
  providerConfig: ProviderRuntimeConfig;
  /** Whether the selected provider has a configured API key. */
  hasProviderKey: boolean;
  /** GitHub token for release-note enrichment when available. */
  token?: string;
  /** GitHub or GHES API base URL. */
  githubApiBase: string;
};

/** Result payload for the changelog LLM output builder. */
export type BuildLlmOutputResult = {
  /** Normalized changelog and PR payload. */
  llm: LLMOutput;
  /** Whether any provider call was used successfully. */
  aiUsed: boolean;
  /** Reasons explaining fallback behavior when AI was skipped or failed. */
  fallbackReasons: string[];
};
