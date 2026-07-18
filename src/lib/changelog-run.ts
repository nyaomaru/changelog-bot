import {
  DEFAULT_PR_LABELS,
  PR_BRANCH_PREFIX,
  PR_TITLE_PREFIX,
} from '@/constants/changelog.js';
import type { AppConfig } from '@/types/config.js';
import type { CliOptions } from '@/schema/cli.js';
import {
  resolveChangelogRunDependencies,
  type ChangelogRunDependencies,
} from '@/lib/changelog-run-dependencies.js';
import {
  resolvePullRequestsBySha,
  resolveReleaseBody,
} from '@/lib/release-data.js';
import {
  writeDryRunOutput,
  type ChangelogRunLogger,
} from '@/lib/changelog-dry-run.js';

export type { ChangelogRunDependencies, ChangelogRunLogger };

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
  const deps = resolveChangelogRunDependencies(params.deps);
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
