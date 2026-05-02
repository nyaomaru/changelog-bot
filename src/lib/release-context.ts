import {
  tryDetectLatestTag,
  tryDetectPrevTag,
  firstCommit,
  dateForRef,
} from '@/lib/git.js';
import { readChangelog } from '@/lib/changelog.js';
import type { CliOptions } from '@/schema/cli.js';
import { getProviderRuntimeConfig } from '@/lib/app-config.js';
import type { AppConfig } from '@/types/config.js';
import type { ProviderName } from '@/types/llm.js';
import { resolveGitHubAuth } from '@/utils/github-auth.js';
import { versionFromRef } from '@/utils/version.js';
import { escapeRegExp } from '@/utils/escape.js';
import { HEAD_REF } from '@/constants/git.js';
import { DATE_YYYY_MM_DD_LEN } from '@/constants/time.js';

/** Derived release metadata used across the CLI workflow. */
export type ReleasePlan = {
  /** Repository owner parsed from `owner/repo`. */
  owner: string;
  /** Repository name parsed from `owner/repo`. */
  repo: string;
  /** Path to the git repository to inspect. */
  repoPath: string;
  /** Path to the changelog file to update. */
  changelogPath: string;
  /** Git ref that identifies the current release. */
  releaseRef: string;
  /** Release version without the leading `v`. */
  version: string;
  /** Previous ref used for compare links and commit ranges. */
  prevRef: string;
  /** Release date in `YYYY-MM-DD` format. */
  date: string;
};

/** Auth and provider availability resolved for a CLI run. */
export type RunCredentials = {
  /** GitHub token resolved from PAT or GitHub App auth. */
  token?: string;
  /** Whether the selected provider has an API key configured. */
  hasProviderKey: boolean;
};

/**
 * Resolve release refs, version, and date from CLI options and repository state.
 * @param cli Validated CLI options.
 * @param repoFullName Repository identifier in `owner/repo` format.
 * @returns Normalized release metadata used by the CLI workflow.
 */
export function resolveReleasePlan(
  cli: CliOptions,
  repoFullName: string,
): ReleasePlan {
  const [owner, repo] = repoFullName.split('/');
  const releaseRef =
    cli.releaseTag || tryDetectLatestTag(cli.repoPath) || HEAD_REF;
  const version = cli.releaseName || versionFromRef(releaseRef);
  const prevRef =
    tryDetectPrevTag(releaseRef, cli.repoPath) || firstCommit(cli.repoPath);
  const date =
    dateForRef(releaseRef, cli.repoPath) ||
    new Date().toISOString().slice(0, DATE_YYYY_MM_DD_LEN);

  return {
    owner,
    repo,
    repoPath: cli.repoPath,
    changelogPath: cli.changelogPath,
    releaseRef,
    version,
    prevRef,
    date,
  };
}

/**
 * Read the changelog and remove any existing compare link for the target version.
 * WHY: The release section already embeds the compare link, so stale bottom links
 * must be removed before recomputing the changelog to keep reruns idempotent.
 * @param changelogPath Path to the changelog file on disk.
 * @param version Release version without the leading `v`.
 * @returns Existing changelog text with the target version link removed.
 */
export function prepareExistingChangelog(
  changelogPath: string,
  version: string,
): string {
  const existingChangelog = readChangelog(changelogPath);
  return existingChangelog.replace(
    new RegExp(`\n\\[v${escapeRegExp(version)}\\]: .*\n?`, 'g'),
    '\n',
  );
}

/**
 * Resolve GitHub auth and provider API-key availability for the current run.
 * @param providerName Selected provider identifier.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param env Environment variables to inspect for provider credentials.
 * @returns Token and provider-key availability for the workflow.
 */
export async function resolveRunCredentials(
  providerName: ProviderName,
  owner: string,
  repo: string,
  appConfig: AppConfig,
): Promise<RunCredentials> {
  const gitHubAuth = await resolveGitHubAuth(owner, repo, appConfig.github);
  return {
    token: gitHubAuth?.token,
    hasProviderKey: Boolean(
      getProviderRuntimeConfig(appConfig, providerName).apiKey,
    ),
  };
}
