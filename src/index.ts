import { gitMergedPRs, commitsInRange } from '@/lib/git.js';
import { writeChangelog } from '@/lib/changelog.js';
import { createPR } from '@/lib/pr.js';
import { mapCommitsToPrs, fetchReleaseBody } from '@/lib/github.js';

import { ensureGithubTokenRequired } from '@/schema/env.js';
import { getProviderRuntimeConfig, loadAppConfig } from '@/lib/app-config.js';
import { providerFactory } from '@/utils/provider.js';
import { getRepoFullName } from '@/utils/repository.js';
import { parseCliArgs } from '@/lib/cli-args.js';
import { buildChangelogLlmOutput } from '@/utils/llm-output.js';
import {
  prepareExistingChangelog,
  resolveReleasePlan,
  resolveRunCredentials,
} from '@/lib/release-context.js';
import { finalizeChangelogUpdate } from '@/lib/changelog-update.js';

import {
  DEFAULT_PR_LABELS,
  PR_BRANCH_PREFIX,
  PR_TITLE_PREFIX,
} from '@/constants/changelog.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';

/**
 * Runs the changelog bot CLI end-to-end.
 * @returns Promise that resolves when the CLI flow completes.
 */
export async function runCli(): Promise<void> {
  const cli = await parseCliArgs(process.argv);
  const appConfig = loadAppConfig();
  const provider = providerFactory(cli.provider, appConfig.providers);
  const {
    owner,
    repo,
    repoPath,
    changelogPath,
    releaseRef,
    version,
    prevRef,
    date,
  } = resolveReleasePlan(cli, getRepoFullName(appConfig));
  const prs = gitMergedPRs(prevRef, releaseRef, repoPath);
  const existing = prepareExistingChangelog(changelogPath, version);

  const commitList = commitsInRange(prevRef, releaseRef, repoPath);
  const commitShas = commitList.map((commit) => commit.sha);

  let apiPrMap: Record<string, { number: number }[]> = {};
  const { token, hasProviderKey } = await resolveRunCredentials(
    provider.name,
    owner,
    repo,
    appConfig,
  );
  if (token) {
    apiPrMap = await mapCommitsToPrs(
      owner,
      repo,
      commitShas,
      token,
      appConfig.github.apiBase,
    );
  }

  let releaseBody = cli.releaseBody || '';
  if (!releaseBody && cli.releaseTag) {
    releaseBody = await fetchReleaseBody(
      owner,
      repo,
      cli.releaseTag,
      token,
      appConfig.github.apiBase,
    );
  }
  const prMapBySha = buildPrMapBySha({
    commitList,
    prsLog: prs,
    repoPath,
    apiPrMap,
  });
  const titleToPr = buildTitleToPr(commitList, prs, prMapBySha);
  let { llm } = await buildChangelogLlmOutput({
    owner,
    repo,
    version,
    date,
    releaseRef,
    prevRef,
    releaseBody,
    existingChangelog: existing,
    commitList,
    prs,
    prMapBySha,
    titleToPr,
    provider,
    providerConfig: getProviderRuntimeConfig(appConfig, provider.name),
    hasProviderKey,
    token,
    githubApiBase: appConfig.github.apiBase,
  });

  const finalizedUpdate = finalizeChangelogUpdate({
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
  const updated = finalizedUpdate.updated;

  // Dry run: print result without writing or PR
  if (cli.dryRun) {
    console.log('==== DRY RUN (no PR) ====');
    console.log(updated);
    return;
  }

  // Write + PR
  writeChangelog(changelogPath, updated);

  ensureGithubTokenRequired(cli.dryRun, token);
  const ghToken = token as string;

  const branch = `${PR_BRANCH_PREFIX}${version}`;
  const prNum = await createPR({
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

  console.log(`Created PR #${prNum}`);
}
