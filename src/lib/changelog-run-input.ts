import type { CliOptions } from '@/schema/cli.js';
import type { AppConfig, ProviderRuntimeConfig } from '@/types/config.js';
import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type { Provider } from '@/types/provider.js';
import type { CustomInstructionsResolution } from '@/lib/customization.js';
import type { ChangelogRunDependencies } from '@/lib/changelog-run-dependencies.js';
import type { ReleasePlan } from '@/lib/release-context.js';
import {
  resolvePullRequestsBySha,
  resolveReleaseBody,
} from '@/lib/release-data.js';

/** Git, GitHub, configuration, and customization inputs for generation. */
export type ChangelogRunInput = {
  /** Selected provider adapter. */
  provider: Provider;
  /** Normalized release metadata. */
  releasePlan: ReleasePlan;
  /** Merge-commit log used by deterministic fallback generation. */
  mergedPullRequests: string;
  /** Existing changelog with the current version link removed. */
  existingChangelog: string;
  /** Commits included in the release range. */
  commitList: CommitLite[];
  /** GitHub token, when authentication is available. */
  token?: string;
  /** Whether the selected provider has an API key. */
  hasProviderKey: boolean;
  /** Pull request metadata keyed by commit SHA. */
  pullRequestsBySha: Record<string, PullRef[]>;
  /** Release notes resolved from CLI input or GitHub. */
  releaseBody: string;
  /** Pull request numbers keyed by commit SHA. */
  prNumbersBySha: Record<string, number[]>;
  /** Pull request numbers keyed by normalized title. */
  titleToPr: Record<string, number>;
  /** Prompt customization text and diagnostics. */
  customInstructionsResolution: CustomInstructionsResolution;
  /** Runtime settings for the selected provider. */
  providerConfig: ProviderRuntimeConfig;
};

/** Parameters used to collect one changelog run's generation inputs. */
export type ResolveChangelogRunInputParams = {
  /** Validated CLI options. */
  cli: CliOptions;
  /** Runtime configuration resolved for this process. */
  appConfig: AppConfig;
  /** Shell, GitHub, and transformation adapters. */
  deps: ChangelogRunDependencies;
};

/**
 * Collect release data and configuration needed to generate a changelog.
 * WHY: Keeping input resolution separate from generation makes the workflow
 * phases explicit and prevents network and filesystem concerns from spreading
 * through the output orchestration.
 * @param params CLI options, runtime configuration, and workflow adapters.
 * @returns Fully resolved input for changelog generation.
 */
export async function resolveChangelogRunInput({
  cli,
  appConfig,
  deps,
}: ResolveChangelogRunInputParams): Promise<ChangelogRunInput> {
  const provider = deps.providerFactory(cli.provider, appConfig.providers);
  const releasePlan = deps.resolveReleasePlan(
    cli,
    deps.getRepoFullName(appConfig),
  );
  const { owner, repo, repoPath, changelogPath, releaseRef, version, prevRef } =
    releasePlan;

  const mergedPullRequests = deps.gitMergedPRs(prevRef, releaseRef, repoPath);
  const existingChangelog = deps.prepareExistingChangelog(
    changelogPath,
    version,
  );
  const commitList = deps.commitsInRange(prevRef, releaseRef, repoPath);
  const { token, hasProviderKey } = await deps.resolveRunCredentials(
    provider.name,
    owner,
    repo,
    appConfig,
  );

  // WHY: These GitHub lookups depend on the same resolved credentials but not
  // on each other, so running them together avoids unnecessary network latency.
  const [pullRequestsBySha, releaseBody] = await Promise.all([
    resolvePullRequestsBySha({
      deps,
      owner,
      repo,
      releaseRef,
      repoPath,
      token,
      githubApiBase: appConfig.github.apiBase,
      commitList,
    }),
    resolveReleaseBody({
      cli,
      deps,
      owner,
      repo,
      token,
      githubApiBase: appConfig.github.apiBase,
    }),
  ]);

  const prNumbersBySha = deps.buildPrMapBySha({
    commitList,
    prsLog: mergedPullRequests,
    repoPath,
    apiPrMap: pullRequestsBySha,
  });
  const titleToPr = deps.buildTitleToPr(
    commitList,
    mergedPullRequests,
    prNumbersBySha,
  );
  const customInstructionsResolution =
    deps.resolveCustomInstructionsWithDiagnostics({
      instructions: cli.instructions,
      instructionsFile: cli.instructionsFile,
      repoPath,
    });

  return {
    provider,
    releasePlan,
    mergedPullRequests,
    existingChangelog,
    commitList,
    token,
    hasProviderKey,
    pullRequestsBySha,
    releaseBody,
    prNumbersBySha,
    titleToPr,
    customInstructionsResolution,
    providerConfig: deps.getProviderRuntimeConfig(appConfig, provider.name),
  };
}
