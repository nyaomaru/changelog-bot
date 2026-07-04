import {
  currentBranch,
  gitMergedPRs,
  commitsInRange,
  tryFindPullRequestNumberForBranch,
} from '@/lib/git.js';
import { writeChangelog } from '@/lib/changelog.js';
import { createPR } from '@/lib/pr.js';
import {
  fetchPRDetails,
  fetchPullRequestsForBranch,
  mapCommitsToPrs,
  fetchReleaseBody,
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
import {
  formatDryRunDiagnostics,
  formatDryRunJsonReport,
} from '@/utils/dry-run-diagnostics.js';
import {
  DEFAULT_PR_LABELS,
  PR_BRANCH_PREFIX,
  PR_TITLE_PREFIX,
} from '@/constants/changelog.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';
import type { AppConfig } from '@/types/config.js';
import type { CliOptions } from '@/schema/cli.js';
import { runWhyExtraction } from '@/lib/why-extraction.js';
import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type { ProviderName } from '@/types/llm.js';
import type { WhyDiagnostics } from '@/types/why.js';

/** Logger used by the CLI runner for user-visible output. */
export type ChangelogRunLogger = (message: string) => void;

type PromptCustomizationReasonInput = {
  /** Whether customization was passed by inline text or file path. */
  requested: boolean;
  /** Whether any usable customization text remained after resolution. */
  resolved: boolean;
  /** Whether provider calls were disabled for this run. */
  noAi: boolean;
  /** Whether the selected provider has a configured API key. */
  hasProviderKey: boolean;
  /** Whether changelog generation used a provider successfully. */
  aiUsed: boolean;
};

/**
 * Explain whether prompt customization affected the generated changelog.
 * @param input Customization resolution and provider execution state.
 * @returns Stable dry-run reason text.
 */
function getPromptCustomizationReason(
  input: PromptCustomizationReasonInput,
): string {
  if (!input.requested) return 'not requested';
  if (!input.resolved) return 'no usable instructions after normalization';
  if (input.noAi)
    return 'not applied because --no-ai skips provider generation';
  if (!input.hasProviderKey) {
    return 'not applied because provider API key is missing';
  }
  if (!input.aiUsed) {
    return 'not applied because provider generation did not complete';
  }
  return 'applied to provider full generation';
}

/** Replaceable dependencies for testing the orchestration without shell/network I/O. */
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
  /** Fetch GitHub release notes when not passed by CLI. */
  fetchReleaseBody: typeof fetchReleaseBody;
  /** Fetch GitHub PR title/body/author details. */
  fetchPRDetails: typeof fetchPRDetails;
  /** Fetch the open pull request associated with the current branch. */
  fetchPullRequestsForBranch: typeof fetchPullRequestsForBranch;
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
  fetchReleaseBody,
  fetchPRDetails,
  fetchPullRequestsForBranch,
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

type ResolvePullRequestsByShaParams = {
  /** Replaceable workflow dependencies for git/GitHub lookups. */
  deps: ChangelogRunDependencies;
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Release ref selected for this run. */
  releaseRef: string;
  /** Local repository path used for git commands. */
  repoPath: string;
  /** GitHub API token, when available. */
  token?: string;
  /** GitHub or GHES API base URL. */
  githubApiBase: string;
  /** Commits included in the release range. */
  commitList: CommitLite[];
  /** Commit SHAs included in the release range. */
  commitShas: string[];
};

async function resolvePullRequestsBySha({
  deps,
  owner,
  repo,
  releaseRef,
  repoPath,
  token,
  githubApiBase,
  commitList,
  commitShas,
}: ResolvePullRequestsByShaParams): Promise<Record<string, PullRef[]>> {
  const branchName =
    releaseRef === 'HEAD' ? deps.currentBranch(repoPath) : null;
  const branchPullRequests = branchName
    ? await deps.fetchPullRequestsForBranch(
        owner,
        repo,
        branchName,
        token,
        githubApiBase,
      )
    : [];
  const remotePrNumber =
    branchName && branchPullRequests.length === 0
      ? deps.tryFindPullRequestNumberForBranch(branchName, repoPath)
      : null;
  const oldestCommit = commitList[commitList.length - 1];
  const remotePullRequest =
    remotePrNumber && oldestCommit
      ? {
          number: remotePrNumber,
          title: oldestCommit.subject,
          url: `https://github.com/${owner}/${repo}/pull/${remotePrNumber}`,
        }
      : null;
  const authoritativePullRequests = branchPullRequests.length
    ? branchPullRequests
    : remotePullRequest
      ? [remotePullRequest]
      : [];

  if (authoritativePullRequests.length) {
    return Object.fromEntries(
      commitShas.map((commitSha) => [commitSha, authoritativePullRequests]),
    );
  }

  return deps.mapCommitsToPrs(owner, repo, commitShas, token, githubApiBase);
}

async function resolveReleaseBody(params: {
  /** Parsed CLI options. */
  cli: CliOptions;
  /** Replaceable workflow dependencies for GitHub lookups. */
  deps: ChangelogRunDependencies;
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** GitHub API token, when available. */
  token?: string;
  /** GitHub or GHES API base URL. */
  githubApiBase: string;
}): Promise<string> {
  if (params.cli.releaseBody) return params.cli.releaseBody;
  if (!params.cli.releaseTag) return '';

  return params.deps.fetchReleaseBody(
    params.owner,
    params.repo,
    params.cli.releaseTag,
    params.token,
    params.githubApiBase,
  );
}

function writeDryRunOutput(params: {
  /** Parsed CLI options. */
  cli: CliOptions;
  /** Logger used for user-visible output. */
  log: ChangelogRunLogger;
  /** Selected provider name. */
  providerName: ProviderName;
  /** Selected model name. */
  modelName: string;
  /** Whether changelog generation used a provider successfully. */
  changelogAiUsed: boolean;
  /** Changelog-generation fallback reasons. */
  fallbackReasons: string[];
  /** Resolved prompt customization and diagnostics. */
  customInstructionsResolution: ReturnType<
    typeof resolveCustomInstructionsWithDiagnostics
  >;
  /** Usable prompt customization text, if any. */
  customInstructions?: string;
  /** Whether the selected provider has a configured API key. */
  hasProviderKey: boolean;
  /** WHY extraction diagnostics. */
  whyDiagnostics: WhyDiagnostics;
  /** Changelog content produced by the run. */
  updated: string;
}): void {
  const {
    cli,
    log,
    providerName,
    modelName,
    changelogAiUsed,
    fallbackReasons,
    customInstructionsResolution,
    customInstructions,
    hasProviderKey,
    whyDiagnostics,
    updated,
  } = params;

  log('==== DRY RUN (no PR) ====');
  const diagnosticsInput = {
    providerName,
    modelName,
    aiUsed: changelogAiUsed || whyDiagnostics.aiUsed,
    fallbackReasons,
    promptCustomization: {
      ...customInstructionsResolution.diagnostics,
      applied: Boolean(customInstructions && changelogAiUsed && !cli.noAi),
      reason: getPromptCustomizationReason({
        requested: customInstructionsResolution.diagnostics.requested,
        resolved: customInstructionsResolution.diagnostics.resolved,
        noAi: cli.noAi,
        hasProviderKey,
        aiUsed: changelogAiUsed,
      }),
    },
    why: whyDiagnostics,
  };
  log(
    cli.dryRunJsonReport
      ? formatDryRunJsonReport(diagnosticsInput)
      : formatDryRunDiagnostics(diagnosticsInput),
  );
  log('');
  log(updated);
}

/**
 * Execute the changelog generation workflow for already-parsed CLI options.
 * WHY: Keeping orchestration here makes `runCli` small and gives tests a seam
 * for replacing shell/network dependencies.
 * @param params CLI options, app config, optional logger, and optional dependency overrides.
 * @returns Promise that resolves after dry-run output or PR creation completes.
 */
export async function executeChangelogRun(params: {
  cli: CliOptions;
  appConfig: AppConfig;
  log?: ChangelogRunLogger;
  deps?: Partial<ChangelogRunDependencies>;
}): Promise<void> {
  const { cli, appConfig, log = console.log } = params;
  const deps = { ...defaultDependencies, ...params.deps };
  const provider = deps.providerFactory(cli.provider, appConfig.providers);
  const {
    owner,
    repo,
    repoPath,
    changelogPath,
    releaseRef,
    version,
    prevRef,
    date,
  } = deps.resolveReleasePlan(cli, deps.getRepoFullName(appConfig));

  const prs = deps.gitMergedPRs(prevRef, releaseRef, repoPath);
  const existing = deps.prepareExistingChangelog(changelogPath, version);
  const commitList = deps.commitsInRange(prevRef, releaseRef, repoPath);
  const commitShas = commitList.map((commit) => commit.sha);

  const { token, hasProviderKey } = await deps.resolveRunCredentials(
    provider.name,
    owner,
    repo,
    appConfig,
  );
  const apiPrMap = await resolvePullRequestsBySha({
    deps,
    owner,
    repo,
    releaseRef,
    repoPath,
    token,
    githubApiBase: appConfig.github.apiBase,
    commitList,
    commitShas,
  });
  const releaseBody = await resolveReleaseBody({
    cli,
    deps,
    owner,
    repo,
    token,
    githubApiBase: appConfig.github.apiBase,
  });

  const prMapBySha = deps.buildPrMapBySha({
    commitList,
    prsLog: prs,
    repoPath,
    apiPrMap,
  });
  const titleToPr = deps.buildTitleToPr(commitList, prs, prMapBySha);
  const customInstructionsResolution =
    deps.resolveCustomInstructionsWithDiagnostics({
      instructions: cli.instructions,
      instructionsFile: cli.instructionsFile,
      repoPath,
    });
  const customInstructions = customInstructionsResolution.instructions;
  const providerConfig = deps.getProviderRuntimeConfig(
    appConfig,
    provider.name,
  );
  const llmOutput = await deps.buildChangelogLlmOutput({
    owner,
    repo,
    version,
    date,
    releaseRef,
    prevRef,
    releaseBody,
    language: cli.language,
    customInstructions,
    existingChangelog: existing,
    commitList,
    prs,
    prMapBySha,
    pullRequestsBySha: apiPrMap,
    titleToPr,
    provider,
    providerConfig,
    hasProviderKey,
    token,
    githubApiBase: appConfig.github.apiBase,
    noAi: cli.noAi,
    requireProvider: cli.requireProvider,
    failOnLlmError: cli.failOnLlmError,
  });
  let llm = llmOutput.llm;

  let finalizedUpdate = deps.finalizeChangelogUpdate({
    owner,
    repo,
    version,
    prevRef,
    releaseRef,
    existing,
    llm,
    titleToPr,
  });
  llm = finalizedUpdate.llm;
  let updated = finalizedUpdate.updated;
  const whyOutput = await deps.runWhyExtraction({
    cli,
    llm,
    provider,
    hasProviderKey,
    owner,
    repo,
    token,
    githubApiBase: appConfig.github.apiBase,
    fetchPRDetails: deps.fetchPRDetails,
  });
  if (whyOutput.llm !== llm) {
    finalizedUpdate = deps.finalizeChangelogUpdate({
      owner,
      repo,
      version,
      prevRef,
      releaseRef,
      existing,
      llm: whyOutput.llm,
      titleToPr,
    });
    llm = finalizedUpdate.llm;
    updated = finalizedUpdate.updated;
  }

  if (cli.dryRun) {
    writeDryRunOutput({
      cli,
      log,
      providerName: provider.name,
      modelName: providerConfig.model,
      changelogAiUsed: llmOutput.aiUsed,
      fallbackReasons: llmOutput.fallbackReasons,
      customInstructionsResolution,
      customInstructions,
      hasProviderKey,
      whyDiagnostics: whyOutput.diagnostics,
      updated,
    });
    return;
  }

  deps.ensureGithubTokenRequired(cli.dryRun, token);
  const ghToken = token as string;

  deps.writeChangelog(changelogPath, updated);

  const branch = `${PR_BRANCH_PREFIX}${version}`;
  const prNum = await deps.createPR({
    owner,
    repo,
    baseBranch: cli.baseBranch,
    branchName: branch,
    title: llm.pr_title || `${PR_TITLE_PREFIX}${version}`,
    body: llm.pr_body || '',
    labels: llm.labels ?? [...DEFAULT_PR_LABELS],
    token: ghToken,
    changelogEntry: cli.changelogPath,
  });

  log(`Created PR #${prNum}`);
}
