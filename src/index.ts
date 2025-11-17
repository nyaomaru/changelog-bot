import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  tryDetectLatestTag,
  tryDetectPrevTag,
  firstCommit,
  gitMergedPRs,
  commitsInRange,
} from '@/lib/git.js';
import { buildLLMInput } from '@/lib/prompt.js';
import {
  readChangelog,
  insertSection,
  updateCompareLinks,
  writeChangelog,
  ensureCompareLinks,
  hasSection,
  replaceSection,
  removeAllSections,
  hasDuplicateVersion,
} from '@/lib/changelog.js';
import { createPR } from '@/lib/pr.js';
import {
  mapCommitsToPrs,
  fetchReleaseBody,
  fetchPRInfo,
} from '@/lib/github.js';

import { LLMOutputSchema } from '@/schema/schema.js';
import { CliOptionsSchema } from '@/schema/cli.js';
import { EnvSchema, ensureGithubTokenRequired } from '@/schema/env.js';
import { resolveGitHubAuth } from '@/utils/github-auth.js';

import type { LLMOutput, ProviderName } from '@/types/llm.js';
import { normalizeSectionCategories } from '@/utils/section-normalize.js';
import { postprocessSection } from '@/utils/section-postprocess.js';
import { parseReleaseNotes, buildSectionFromRelease } from '@/utils/release.js';
import { classifyTitles } from '@/utils/classify.js';
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';
import { buildTitlesForClassification } from '@/utils/classify-pre.js';
import { providerFactory } from '@/utils/provider.js';
import { getRepoFullName } from '@/utils/repository.js';
import { versionFromRef } from '@/utils/version.js';
import { fallbackSection } from '@/utils/fallback.js';
import { escapeRegExp } from '@/utils/escape.js';
import { isNumber } from '@/utils/is.js';

import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
  HEAD_REF,
  SHA_SHORT_LENGTH,
} from '@/constants/git.js';
import {
  DEFAULT_PR_LABELS,
  PR_BRANCH_PREFIX,
  PR_TITLE_PREFIX,
  UNRELEASED_ANCHOR,
} from '@/constants/changelog.js';
import { LLM_TRUNCATE_LIMIT } from '@/constants/prompt.js';
import { DATE_YYYY_MM_DD_LEN } from '@/constants/time.js';
import { PROVIDER_NAMES, PROVIDER_OPENAI } from '@/constants/provider.js';
import { sanitizeLLMOutput } from '@/utils/sanitize.js';
import { buildPrMapBySha, buildTitleToPr } from '@/utils/pr-mapping.js';

/**
 * Runs the changelog bot CLI end-to-end.
 * @returns Promise that resolves when the CLI flow completes.
 */
export async function runCli(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('repo-path', { type: 'string', default: '.' })
    .option('changelog-path', {
      type: 'string',
      default: DEFAULT_CHANGELOG_FILE,
    })
    .option('base-branch', { type: 'string', default: DEFAULT_BASE_BRANCH })
    .option('provider', {
      type: 'string',
      choices: [...PROVIDER_NAMES] as unknown as readonly string[],
      default: PROVIDER_OPENAI,
    })
    .option('release-tag', { type: 'string' })
    .option('release-name', { type: 'string' })
    .option('release-body', { type: 'string', default: '' })
    .option('dry-run', { type: 'boolean', default: false })
    .strict()
    .parse();

  // Normalize and validate CLI options with Zod
  const cli = CliOptionsSchema.parse({
    repoPath: argv['repo-path'],
    changelogPath: argv['changelog-path'],
    baseBranch: argv['base-branch'],
    provider: argv.provider as ProviderName,
    releaseTag: argv['release-tag'],
    releaseName: argv['release-name'],
    releaseBody: argv['release-body'],
    dryRun: argv['dry-run'],
  });

  const repoPath = cli.repoPath;
  const provider = providerFactory(cli.provider as ProviderName);
  const [owner, repo] = getRepoFullName().split('/');
  let aiUsed = false;
  const fallbackReasons: string[] = [];

  // Resolve refs
  const releaseRef = cli.releaseTag || tryDetectLatestTag(repoPath) || HEAD_REF;
  const version = cli.releaseName || versionFromRef(releaseRef);
  const prevRef =
    tryDetectPrevTag(releaseRef, repoPath) || firstCommit(repoPath);

  // Inputs
  const date = new Date().toISOString().slice(0, DATE_YYYY_MM_DD_LEN);
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
  const parsedRelease = parseReleaseNotes(releaseBody, { owner, repo });

  const prMapBySha = buildPrMapBySha({
    commitList,
    prsLog: prs,
    repoPath,
    apiPrMap,
  });
  const titleToPr = buildTitleToPr(commitList, prs, prMapBySha);

  let llm: LLMOutput | null = null;
  if (parsedRelease.items.length) {
    // Non-LLM path using GitHub Release Notes as the source of truth.
    aiUsed = false;
    fallbackReasons.push(
      'Used GitHub Release Notes as the source (no model call)'
    );
    for (const item of parsedRelease.items) {
      if (!item.pr) {
        const candidateKeys = [item.title, item.rawTitle]
          .filter(Boolean)
          .map((value) => value!.toLowerCase());
        const num = candidateKeys
          .map((key) => titleToPr[key])
          .find((value) => isNumber(value));
        if (num) {
          item.pr = num;
          item.url = `https://github.com/${owner}/${repo}/pull/${num}`;
        }
      }
      if (item.pr) {
        if (!item.url) {
          item.url = `https://github.com/${owner}/${repo}/pull/${item.pr}`;
        }
        if (!item.author) {
          try {
            const pr = await fetchPRInfo(owner, repo, item.pr, token);
            if (pr?.author) item.author = pr.author;
            if (pr?.url) item.url = pr.url;
          } catch {
            console.warn(`Warning: Failed to fetch PR #${item.pr} info`);
          }
        }
      }
    }
    const titlesForLLM = buildTitlesForClassification(parsedRelease.items);
    let categories = await classifyTitles(titlesForLLM, provider.name);
    // Heuristic tuning: ensure typing/contract corrections are grouped under Fixed.
    categories = tuneCategoriesByTitle(parsedRelease.items, categories);
    const section = buildSectionFromRelease({
      version,
      date,
      items: parsedRelease.items,
      categories,
      fullChangelog: parsedRelease.fullChangelog,
      sections: parsedRelease.sections,
    });
    llm = {
      new_section_markdown: section,
      insert_after_anchor: UNRELEASED_ANCHOR,
      pr_title: `${PR_TITLE_PREFIX}${version}`,
      pr_body: `Auto-generated CHANGELOG. Range: \`${prevRef}..${releaseRef}\``,
      labels: [...DEFAULT_PR_LABELS],
    };
    if (!aiUsed && llm.pr_body) {
      const reasonNote = fallbackReasons.length
        ? `\n\nNote: Generated without LLM. Reason: ${fallbackReasons.join(
            '; '
          )}.`
        : `\n\nNote: Generated without LLM.`;
      llm.pr_body += reasonNote;
    }
  } else {
    const logsForLLM = commitList
      .map((commit) => {
        const numbers = prMapBySha[commit.sha];
        const suffix = numbers?.length ? ` (#${numbers[0]})` : '';
        return `${commit.sha.slice(0, SHA_SHORT_LENGTH)} ${
          commit.subject
        }${suffix}`;
      })
      .join('\n');

    const llmInput = buildLLMInput({
      repo: `${owner}/${repo}`,
      version,
      date,
      releaseTag: releaseRef,
      prevTag: prevRef,
      releaseBody: releaseBody,
      gitLog: logsForLLM,
      mergedPRs: prs,
      changelog: existing,
      language: 'en',
    });

    if (!hasProviderKey) {
      fallbackReasons.push(`Missing API key for provider: ${provider.name}`);
    } else {
      try {
        const first = await provider.generate(llmInput);
        const parsed = LLMOutputSchema.safeParse(first);
        if (parsed.success) {
          llm = parsed.data;
          aiUsed = true;
        } else {
          const shorter = {
            ...llmInput,
            releaseBody: llmInput.releaseBody.slice(0, LLM_TRUNCATE_LIMIT),
            gitLog: llmInput.gitLog.slice(0, LLM_TRUNCATE_LIMIT),
          };
          const second = await provider.generate(shorter);
          const parsed2 = LLMOutputSchema.safeParse(second);
          if (parsed2.success) {
            llm = parsed2.data;
            aiUsed = true;
          } else {
            fallbackReasons.push('LLM output did not match schema after retry');
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fallbackReasons.push(`LLM generation failed: ${message}`);
      }
    }

    llm = sanitizeLLMOutput(llm);

    if (!llm) {
      llm = {
        new_section_markdown: fallbackSection({
          version,
          date,
          logs: commitList
            .map(
              (commit) =>
                `${commit.sha.slice(0, SHA_SHORT_LENGTH)} ${commit.subject}`
            )
            .join('\n'),
          prs,
          prMapBySha,
        }),
        insert_after_anchor: UNRELEASED_ANCHOR,
        pr_title: `${PR_TITLE_PREFIX}${version}`,
        pr_body: `Auto-generated CHANGELOG (fallback). Range: \`${prevRef}..${releaseRef}\``,
        labels: [...DEFAULT_PR_LABELS],
      };
    } else {
      if (llm.new_section_markdown) {
        llm.new_section_markdown = normalizeSectionCategories(
          llm.new_section_markdown
        );
      }
      if (!llm.pr_title) llm.pr_title = `${PR_TITLE_PREFIX}${version}`;
      if (!llm.pr_body) {
        llm.pr_body = `Auto-generated CHANGELOG. Range: \`${prevRef}..${releaseRef}\``;
      }
      if (!llm.insert_after_anchor) llm.insert_after_anchor = UNRELEASED_ANCHOR;
      if (!llm.labels) llm.labels = [...DEFAULT_PR_LABELS];
    }
    // If this section was not produced by the LLM, annotate the PR body with reasons.
    if (!aiUsed && llm.pr_body) {
      const reasonNote = fallbackReasons.length
        ? `\n\nNote: Generated without LLM. Reason: ${fallbackReasons.join(
            '; '
          )}.`
        : `\n\nNote: Generated without LLM.`;
      llm.pr_body += reasonNote;
    }
  }

  if (llm.new_section_markdown) {
    llm.new_section_markdown = postprocessSection(
      llm.new_section_markdown,
      titleToPr
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

  // Remove duplicate sections before applying changes
  if (hasDuplicateVersion(existing, version)) {
    existing = removeAllSections(existing, version);
  }

  // Apply changes
  let updated: string;
  if (hasSection(existing, version)) {
    updated = replaceSection(existing, version, llm.new_section_markdown);
  } else {
    updated = insertSection(
      existing,
      llm.insert_after_anchor!,
      llm.new_section_markdown
    );
  }
  updated = updateCompareLinks(
    updated,
    undefined,
    llm.unreleased_compare_update ?? unreleasedLine
  );

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
    labels: llm.labels ?? ['changelog'],
    token: ghToken,
    changelogEntry: cli.changelogPath,
  });

  console.log(`Created PR #${prNum}`);
}
