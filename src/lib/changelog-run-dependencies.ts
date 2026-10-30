import {
  commitsInRange,
  currentBranch,
  gitMergedPRs,
  tryFindPullRequestNumberForBranch,
} from '@/lib/git.js';
import { writeChangelog } from '@/lib/changelog.js';
import { createPR } from '@/lib/pr.js';
import {
  fetchPRDetails,
  fetchPullRequestsForBranch,
  fetchPullRequestsForBranchResult,
  fetchReleaseBody,
  fetchReleaseBodyResult,
  mapCommitsToPrs,
  mapCommitsToPrsWithDiagnostics,
} from '@/lib/github.js';
import { ensureGithubTokenRequired } from '@/schema/env.js';
import { getProviderRuntimeConfig } from '@/lib/app-config.js';
import { providerFactory } from '@/utils/provider.js';
import { getRepoFullName } from '@/utils/repository.js';
import { buildChangelogLlmOutput } from '@/utils/llm-output.js';
import {
  prepareExistingChangelog,
  resolveReleasePlan,
  resolveRunCredentials,
} from '@/lib/release-context.js';
import { finalizeChangelogUpdate } from '@/lib/changelog-update.js';
import { resolveCustomInstructionsWithDiagnostics } from '@/lib/customization.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';
import { runWhyExtraction } from '@/lib/why-extraction.js';
import { createMetadataDiagnostics } from '@/utils/metadata-diagnostics.js';

/** Replaceable dependencies for testing changelog orchestration without shell/network I/O. */
export type ChangelogRunDependencies = {
  /** Factory for the selected LLM provider. */
  providerFactory: typeof providerFactory;
  /** Resolve repository slug from config/environment. */
  getRepoFullName: typeof getRepoFullName;
  /** Resolve release refs and metadata. */
  resolveReleasePlan: typeof resolveReleasePlan;
  /** Read merge commits/PR log from git. */
  gitMergedPRs: typeof gitMergedPRs;
  /** Read commits in the release range. */
  commitsInRange: typeof commitsInRange;
  /** Read the currently checked-out branch name. */
  currentBranch: typeof currentBranch;
  /** Resolve a branch PR number from remote git refs. */
  tryFindPullRequestNumberForBranch: typeof tryFindPullRequestNumberForBranch;
  /** Read and normalize the existing changelog. */
  prepareExistingChangelog: typeof prepareExistingChangelog;
  /** Resolve GitHub auth and provider-key availability. */
  resolveRunCredentials: typeof resolveRunCredentials;
  /** Map commits to PRs via GitHub API. */
  mapCommitsToPrs: typeof mapCommitsToPrs;
  /** Map commits to PRs with structured lookup diagnostics. */
  mapCommitsToPrsWithDiagnostics?: typeof mapCommitsToPrsWithDiagnostics;
  /** Fetch GitHub release notes when not passed by CLI. */
  fetchReleaseBody: typeof fetchReleaseBody;
  /** Fetch GitHub release notes with structured lookup result. */
  fetchReleaseBodyResult?: typeof fetchReleaseBodyResult;
  /** Fetch GitHub PR title/body/author details. */
  fetchPRDetails: typeof fetchPRDetails;
  /** Fetch the open pull request associated with the current branch. */
  fetchPullRequestsForBranch: typeof fetchPullRequestsForBranch;
  /** Fetch the open pull request associated with the current branch with structured result. */
  fetchPullRequestsForBranchResult?: typeof fetchPullRequestsForBranchResult;
  /** Resolve changelog customization instructions with diagnostics. */
  resolveCustomInstructionsWithDiagnostics: typeof resolveCustomInstructionsWithDiagnostics;
  /** Build commit SHA -> PR number mappings. */
  buildPrMapBySha: typeof buildPrMapBySha;
  /** Build normalized title -> PR number mappings. */
  buildTitleToPr: typeof buildTitleToPr;
  /** Resolve model/API-key settings for the selected provider. */
  getProviderRuntimeConfig: typeof getProviderRuntimeConfig;
  /** Build the changelog section through release notes, model, or fallback. */
  buildChangelogLlmOutput: typeof buildChangelogLlmOutput;
  /** Sanitize and insert the generated changelog section. */
  finalizeChangelogUpdate: typeof finalizeChangelogUpdate;
  /** Extract and apply WHY notes after the changelog section is generated. */
  runWhyExtraction: typeof runWhyExtraction;
  /** Write changelog content to disk. */
  writeChangelog: typeof writeChangelog;
  /** Assert a GitHub token is available when PR creation needs it. */
  ensureGithubTokenRequired: typeof ensureGithubTokenRequired;
  /** Commit, push, and create the pull request. */
  createPR: typeof createPR;
};

const defaultDependencies: ChangelogRunDependencies = {
  providerFactory,
  getRepoFullName,
  resolveReleasePlan,
  gitMergedPRs,
  commitsInRange,
  currentBranch,
  tryFindPullRequestNumberForBranch,
  prepareExistingChangelog,
  resolveRunCredentials,
  mapCommitsToPrs,
  mapCommitsToPrsWithDiagnostics,
  fetchReleaseBody,
  fetchReleaseBodyResult,
  fetchPRDetails,
  fetchPullRequestsForBranch,
  fetchPullRequestsForBranchResult,
  resolveCustomInstructionsWithDiagnostics,
  buildPrMapBySha,
  buildTitleToPr,
  getProviderRuntimeConfig,
  buildChangelogLlmOutput,
  finalizeChangelogUpdate,
  runWhyExtraction,
  writeChangelog,
  ensureGithubTokenRequired,
  createPR,
};

/**
 * Merge dependency overrides with the production changelog workflow adapters.
 * @param overrides Partial adapters supplied by tests or alternate runtimes.
 * @returns Complete dependency set for one changelog run.
 */
export function resolveChangelogRunDependencies(
  overrides: Partial<ChangelogRunDependencies> = {},
): ChangelogRunDependencies {
  const merged: ChangelogRunDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  // WHY: Legacy and mock dependencies often provide mapCommitsToPrs instead of
  // mapCommitsToPrsWithDiagnostics. Adapt the simplified method so diagnostic-aware
  // workflows route through the caller-provided mock.
  if (overrides.mapCommitsToPrs && !overrides.mapCommitsToPrsWithDiagnostics) {
    merged.mapCommitsToPrsWithDiagnostics = async (
      owner,
      repo,
      commitShas,
      token,
      githubApiBase,
    ) => {
      const pullRequestsBySha = await overrides.mapCommitsToPrs!(
        owner,
        repo,
        commitShas,
        token,
        githubApiBase,
      );
      const diagnostics = createMetadataDiagnostics();
      diagnostics.totalLookups = commitShas.length;
      diagnostics.successfulLookups = commitShas.length;
      return { pullRequestsBySha, diagnostics };
    };
  }

  // WHY: When tests mock fetchPullRequestsForBranch, ensure diagnostics callers
  // observe the mock response instead of invoking the production fetchPullRequestsForBranchResult.
  if (
    overrides.fetchPullRequestsForBranch &&
    !overrides.fetchPullRequestsForBranchResult
  ) {
    merged.fetchPullRequestsForBranchResult = async (
      owner,
      repo,
      branch,
      token,
      githubApiBase,
    ) => {
      const pullRequests = await overrides.fetchPullRequestsForBranch!(
        owner,
        repo,
        branch,
        token,
        githubApiBase,
      );
      return { status: 'success', data: pullRequests };
    };
  }

  // WHY: When tests mock fetchReleaseBody, adapt it to return a successful lookup result.
  if (overrides.fetchReleaseBody && !overrides.fetchReleaseBodyResult) {
    merged.fetchReleaseBodyResult = async (
      owner,
      repo,
      tag,
      token,
      githubApiBase,
    ) => {
      const releaseBody = await overrides.fetchReleaseBody!(
        owner,
        repo,
        tag,
        token,
        githubApiBase,
      );
      return { status: 'success', data: releaseBody };
    };
  }

  return merged;
}
