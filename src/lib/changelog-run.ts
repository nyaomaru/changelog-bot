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
  writeDryRunOutput,
  type ChangelogRunLogger,
} from '@/lib/changelog-dry-run.js';
import { resolveChangelogRunInput } from '@/lib/changelog-run-input.js';
import { finalizeChangelogRunOutput } from '@/lib/changelog-run-output.js';

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
  const {
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
    providerConfig,
  } = await resolveChangelogRunInput({
    cli,
    appConfig,
    deps,
  });
  const { owner, repo, changelogPath, releaseRef, version, prevRef, date } =
    releasePlan;
  const customInstructions = customInstructionsResolution.instructions;
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
    existingChangelog,
    commitList,
    prs: mergedPullRequests,
    prMapBySha: prNumbersBySha,
    pullRequestsBySha,
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
  const finalizedOutput = await finalizeChangelogRunOutput({
    cli,
    llm: llmOutput.llm,
    provider,
    hasProviderKey,
    owner,
    repo,
    version,
    prevRef,
    releaseRef,
    existingChangelog,
    titleToPr,
    token,
    githubApiBase: appConfig.github.apiBase,
    deps,
  });
  const { llm, updatedChangelog, whyDiagnostics } = finalizedOutput;

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
      whyDiagnostics,
      updated: updatedChangelog,
    });
    return;
  }

  deps.ensureGithubTokenRequired(cli.dryRun, token);
  const ghToken = token as string;

  deps.writeChangelog(changelogPath, updatedChangelog);

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
