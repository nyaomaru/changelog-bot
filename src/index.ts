import {
  tryDetectLatestTag,
  tryDetectPrevTag,
  firstCommit,
  gitMergedPRs,
  commitsInRange,
  dateForRef,
} from '@/lib/git.js';
import {
  readChangelog,
  writeChangelog,
  ensureCompareLinks,
  computeChangelog,
} from '@/lib/changelog.js';
import { createPR } from '@/lib/pr.js';
import { mapCommitsToPrs, fetchReleaseBody } from '@/lib/github.js';

import { EnvSchema, ensureGithubTokenRequired } from '@/schema/env.js';
import { resolveGitHubAuth } from '@/utils/github-auth.js';

import type { LLMOutput } from '@/types/llm.js';
import { postprocessSection } from '@/utils/section-postprocess.js';
import { FULL_CHANGELOG_RE } from '@/constants/release.js';
import { providerFactory } from '@/utils/provider.js';
import { getRepoFullName } from '@/utils/repository.js';
import { versionFromRef } from '@/utils/version.js';
import { escapeRegExp } from '@/utils/escape.js';
import { parseCliArgs } from '@/lib/cli-args.js';
import { buildChangelogLlmOutput } from '@/utils/llm-output.js';

import { HEAD_REF } from '@/constants/git.js';
import {
  DEFAULT_PR_LABELS,
  PR_BRANCH_PREFIX,
  PR_TITLE_PREFIX,
} from '@/constants/changelog.js';
import { DATE_YYYY_MM_DD_LEN } from '@/constants/time.js';
import { sanitizeLLMOutput } from '@/utils/sanitize.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';

/**
 * Runs the changelog bot CLI end-to-end.
 * @returns Promise that resolves when the CLI flow completes.
 */
export async function runCli(): Promise<void> {
  const cli = await parseCliArgs(process.argv);

  const repoPath = cli.repoPath;
  const provider = providerFactory(cli.provider);
  const [owner, repo] = getRepoFullName().split('/');

  // Resolve refs
  const releaseRef = cli.releaseTag || tryDetectLatestTag(repoPath) || HEAD_REF;
  const version = cli.releaseName || versionFromRef(releaseRef);
  const prevRef =
    tryDetectPrevTag(releaseRef, repoPath) || firstCommit(repoPath);

  // Inputs
  // Prefer the release/tag commit date for CHANGELOG entries; fallback to today when unavailable.
  const date =
    dateForRef(releaseRef, repoPath) ||
    new Date().toISOString().slice(0, DATE_YYYY_MM_DD_LEN);
  const prs = gitMergedPRs(prevRef, releaseRef, repoPath);
  const changelogPath = cli.changelogPath;
  let existing = readChangelog(changelogPath);
  existing = existing.replace(
    new RegExp(`\n[v${escapeRegExp(version)}]: .*\n?`, 'g'),
    '\n'
  );

  const commitList = commitsInRange(prevRef, releaseRef, repoPath);
  const commitShas = commitList.map((c) => c.sha);

  let apiPrMap: Record<string, { number: number }[]> = {};
  const envParsed = EnvSchema.safeParse(process.env);
  // Resolve GitHub auth: prefer PAT, then GitHub App token
  const ghAuth = await resolveGitHubAuth(owner, repo);
  const token = ghAuth?.token;
  const hasProviderKey = (() => {
    const openai = envParsed.success
      ? envParsed.data.OPENAI_API_KEY
      : process.env.OPENAI_API_KEY;
    const anthropic = envParsed.success
      ? envParsed.data.ANTHROPIC_API_KEY
      : process.env.ANTHROPIC_API_KEY;
    return provider.name === 'openai' ? Boolean(openai) : Boolean(anthropic);
  })();
  if (token) {
    apiPrMap = await mapCommitsToPrs(owner, repo, commitShas, token);
  }

  let releaseBody = cli.releaseBody || '';
  if (!releaseBody && cli.releaseTag) {
    releaseBody = await fetchReleaseBody(owner, repo, cli.releaseTag, token);
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
    hasProviderKey,
    token,
  });

  // Unify LLM output sanitization across both paths (release-notes/LLM/fallback).
  // Type guard: logic above guarantees llm is set; enforce at runtime for safety.
  if (!llm) throw new Error('Internal error: LLM output was not constructed');
  llm = sanitizeLLMOutput(llm) as LLMOutput;

  if (llm.new_section_markdown) {
    llm.new_section_markdown = postprocessSection(
      llm.new_section_markdown,
      titleToPr,
      { owner, repo }
    );
  }

  const { compareLine, unreleasedLine } = ensureCompareLinks({
    owner,
    repo,
    prevTag: prevRef,
    releaseRef,
    version,
    existing,
  });

  const compare = llm.compare_link_line ?? compareLine;
  if (llm.new_section_markdown && compare) {
    const ref = `[v${version}]:`;
    if (!llm.new_section_markdown.includes(ref)) {
      llm.new_section_markdown = `${llm.new_section_markdown}\n${compare}`;
    }
  }

  // Ensure Full Changelog line exists when release notes were not used or missing.
  if (
    llm.new_section_markdown &&
    !FULL_CHANGELOG_RE.test(llm.new_section_markdown)
  ) {
    const fullUrl = `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(
      prevRef
    )}...${encodeURIComponent(releaseRef)}`;
    llm.new_section_markdown = `${llm.new_section_markdown}\n**Full Changelog**: ${fullUrl}\n`;
  }

  // Compute next changelog content (pure function)
  const updated = computeChangelog(existing, {
    version,
    newSection: llm.new_section_markdown,
    insertAfterAnchor: llm.insert_after_anchor!,
    compareLine: undefined, // compare ref already embedded in section
    unreleasedLine: llm.unreleased_compare_update ?? unreleasedLine,
  });

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
