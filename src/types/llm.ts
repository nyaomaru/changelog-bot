/** Supported LLM provider identifiers. */
export type ProviderName = 'openai' | 'anthropic';

/** Input payload shared across all LLM providers. */
export type LLMInput = {
  /** Repository identifier in `owner/repo` format. */
  repo: string;
  /** Release version without the leading `v`. */
  version: string;
  /** ISO date string for the release. */
  date: string;
  /** Git ref (tag or HEAD) representing the release. */
  releaseTag: string;
  /** Previous git tag used to compute compare ranges. */
  prevTag: string;
  /** Release notes body pulled from GitHub (if available). */
  releaseBody: string;
  /** `git log` output for recent commits. */
  gitLog: string;
  /** Formatted list of merged PRs. */
  mergedPRs: string;
  /** Truncated snapshot of the existing changelog. */
  changelogPreview: string;
  /** Output language; currently fixed to English. */
  language: 'en';
};

/** Structured output expected from provider responses. */
export type LLMOutput = {
  /** Markdown for the newly generated changelog section. */
  new_section_markdown: string;
  /** Anchor line after which to insert the new section. */
  insert_after_anchor?: string;
  /** Optional compare link line for the release header. */
  compare_link_line?: string;
  /** Optional compare link update for the Unreleased section. */
  unreleased_compare_update?: string;
  /** Suggested pull request title. */
  pr_title: string;
  /** Suggested pull request body. */
  pr_body: string;
  /** Labels that should be applied to the generated PR. */
  labels?: string[];
};

/** Contract implemented by provider adapters. */
export interface LLMProvider {
  /** Provider identifier matching CLI flag values. */
  name: ProviderName;
  /**
   * Generate structured changelog content from the given input.
   * @param input Normalized payload to feed into the provider.
   * @returns Structured output that drives changelog updates and PR creation.
   */
  generate(input: LLMInput): Promise<LLMOutput>;
}
