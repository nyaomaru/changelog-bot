import { buildLLMInput } from '@/lib/prompt.js';
import { fetchPRInfo } from '@/lib/github.js';

import { parseOrRetryLLMOutput } from '@/utils/llm-parse.js';
import { normalizeSectionCategories } from '@/utils/section-normalize.js';
import { parseReleaseNotes, buildSectionFromRelease } from '@/utils/release.js';
import { classifyTitles } from '@/utils/classify.js';
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';
import { buildTitlesForClassification } from '@/utils/classify-pre.js';
import { fallbackSection } from '@/utils/fallback.js';
import { isNumber } from '@/utils/is.js';

import {
  DEFAULT_PR_LABELS,
  PR_TITLE_PREFIX,
  UNRELEASED_ANCHOR,
} from '@/constants/changelog.js';
import { SHA_SHORT_LENGTH } from '@/constants/git.js';

import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import type { CommitLite } from '@/types/commit.js';

type TitleToPrMap = Record<string, number>;
type PrNumbersBySha = Record<string, number[]>;

type BuildLlmOutputParams = {
  owner: string;
  repo: string;
  version: string;
  date: string;
  releaseRef: string;
  prevRef: string;
  releaseBody: string;
  existingChangelog: string;
  commitList: CommitLite[];
  prs: string;
  prMapBySha: PrNumbersBySha;
  titleToPr: TitleToPrMap;
  provider: Provider;
  hasProviderKey: boolean;
  token?: string;
};

/**
 * Result payload for the changelog LLM output builder.
 */
export type BuildLlmOutputResult = {
  llm: LLMOutput;
  aiUsed: boolean;
  fallbackReasons: string[];
};

/**
 * Build the LLM output payload used for changelog updates and PR creation.
 * WHY: Centralizes the release-notes, model, and fallback paths so the CLI flow stays readable.
 * @param params Inputs needed to construct or infer the changelog section.
 * @returns Output payload plus metadata about LLM usage.
 */
export async function buildChangelogLlmOutput(
  params: BuildLlmOutputParams,
): Promise<BuildLlmOutputResult> {
  const fallbackReasons: string[] = [];
  const fromRelease = await buildOutputFromReleaseNotes(
    params,
    fallbackReasons,
  );
  if (fromRelease) return fromRelease;

  return buildOutputFromModelOrFallback(params, fallbackReasons);
}

function buildPrUrl(owner: string, repo: string, prNumber: number): string {
  return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
}

function buildAutoPrBody(
  prevRef: string,
  releaseRef: string,
  isFallback: boolean,
): string {
  const prefix = isFallback
    ? 'Auto-generated CHANGELOG (fallback)'
    : 'Auto-generated CHANGELOG';
  return `${prefix}. Range: \`${prevRef}..${releaseRef}\``;
}

function appendFallbackNote(prBody: string, fallbackReasons: string[]): string {
  const reasonNote = fallbackReasons.length
    ? `\n\nNote: Generated without LLM. Reason: ${fallbackReasons.join('; ')}.`
    : `\n\nNote: Generated without LLM.`;
  return `${prBody}${reasonNote}`;
}

function resolvePrFromTitles(
  titleToPr: TitleToPrMap,
  titles: Array<string | undefined>,
): number | undefined {
  const candidateKeys = titles
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
  return candidateKeys
    .map((key) => titleToPr[key])
    .find((value) => isNumber(value));
}

/**
 * Fill missing PR numbers/URLs/authors for release note items when possible.
 * WHY: Release notes omit metadata; we backfill via title mapping and GitHub API.
 */
async function enrichReleaseItems(params: {
  owner: string;
  repo: string;
  token?: string;
  titleToPr: TitleToPrMap;
  items: Array<{
    title: string;
    rawTitle?: string;
    pr?: number;
    url?: string;
    author?: string;
  }>;
}): Promise<void> {
  const { owner, repo, token, titleToPr, items } = params;

  for (const item of items) {
    if (!item.pr) {
      const num = resolvePrFromTitles(titleToPr, [item.title, item.rawTitle]);
      if (num) {
        item.pr = num;
        item.url = buildPrUrl(owner, repo, num);
      }
    }
    if (item.pr) {
      if (!item.url) {
        item.url = buildPrUrl(owner, repo, item.pr);
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
}

function buildLogsForLLM(
  commitList: CommitLite[],
  prMapBySha: PrNumbersBySha,
): string {
  return commitList
    .map((commit) => {
      const numbers = prMapBySha[commit.sha];
      const suffix = numbers?.length ? ` (#${numbers[0]})` : '';
      return `${commit.sha.slice(0, SHA_SHORT_LENGTH)} ${
        commit.subject
      }${suffix}`;
    })
    .join('\n');
}

function applyLlmDefaults(
  llm: LLMOutput,
  params: {
    version: string;
    prevRef: string;
    releaseRef: string;
  },
): LLMOutput {
  const output: LLMOutput = { ...llm };
  if (output.new_section_markdown) {
    output.new_section_markdown = normalizeSectionCategories(
      output.new_section_markdown,
    );
  }
  if (!output.pr_title) output.pr_title = `${PR_TITLE_PREFIX}${params.version}`;
  if (!output.pr_body) {
    output.pr_body = buildAutoPrBody(params.prevRef, params.releaseRef, false);
  }
  if (!output.insert_after_anchor)
    output.insert_after_anchor = UNRELEASED_ANCHOR;
  if (!output.labels) output.labels = [...DEFAULT_PR_LABELS];
  return output;
}

async function buildOutputFromReleaseNotes(
  params: BuildLlmOutputParams,
  fallbackReasons: string[],
): Promise<BuildLlmOutputResult | null> {
  const {
    owner,
    repo,
    version,
    date,
    prevRef,
    releaseRef,
    releaseBody,
    titleToPr,
    provider,
    hasProviderKey,
    token,
  } = params;

  const parsedRelease = parseReleaseNotes(releaseBody, { owner, repo });
  if (!parsedRelease.items.length) return null;

  fallbackReasons.push(
    'Used GitHub Release Notes as the source (no model call)',
  );
  let aiUsed = false;

  await enrichReleaseItems({
    owner,
    repo,
    token,
    titleToPr,
    items: parsedRelease.items,
  });

  const titlesForLLM = buildTitlesForClassification(parsedRelease.items);
  let categories = await classifyTitles(titlesForLLM, provider.name);
  // Mark that an LLM was used when classification ran with a valid provider key.
  aiUsed = aiUsed || hasProviderKey;
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

  const llm: LLMOutput = {
    new_section_markdown: section,
    insert_after_anchor: UNRELEASED_ANCHOR,
    pr_title: `${PR_TITLE_PREFIX}${version}`,
    pr_body: buildAutoPrBody(prevRef, releaseRef, false),
    labels: [...DEFAULT_PR_LABELS],
  };

  if (!aiUsed && llm.pr_body) {
    llm.pr_body = appendFallbackNote(llm.pr_body, fallbackReasons);
  }

  return { llm, aiUsed, fallbackReasons };
}

async function buildOutputFromModelOrFallback(
  params: BuildLlmOutputParams,
  fallbackReasons: string[],
): Promise<BuildLlmOutputResult> {
  const {
    owner,
    repo,
    version,
    date,
    prevRef,
    releaseRef,
    releaseBody,
    existingChangelog,
    commitList,
    prs,
    prMapBySha,
    provider,
    hasProviderKey,
  } = params;

  const logsForLLM = buildLogsForLLM(commitList, prMapBySha);

  const llmInput = buildLLMInput({
    repo: `${owner}/${repo}`,
    version,
    date,
    releaseTag: releaseRef,
    prevTag: prevRef,
    releaseBody,
    gitLog: logsForLLM,
    mergedPRs: prs,
    changelog: existingChangelog,
    language: 'en',
  });

  let aiUsed = false;
  let llm: LLMOutput | null = null;

  if (!hasProviderKey) {
    fallbackReasons.push(`Missing API key for provider: ${provider.name}`);
  } else {
    try {
      llm = await parseOrRetryLLMOutput(provider, llmInput);
      aiUsed = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fallbackReasons.push(`LLM generation failed: ${message}`);
    }
  }

  if (!llm) {
    llm = {
      new_section_markdown: fallbackSection({
        version,
        date,
        logs: commitList
          .map(
            (commit) =>
              `${commit.sha.slice(0, SHA_SHORT_LENGTH)} ${commit.subject}`,
          )
          .join('\n'),
        prs,
        prMapBySha,
      }),
      insert_after_anchor: UNRELEASED_ANCHOR,
      pr_title: `${PR_TITLE_PREFIX}${version}`,
      pr_body: buildAutoPrBody(prevRef, releaseRef, true),
      labels: [...DEFAULT_PR_LABELS],
    };
  } else {
    llm = applyLlmDefaults(llm, { version, prevRef, releaseRef });
  }

  // If this section was not produced by the LLM, annotate the PR body with reasons.
  if (!aiUsed && llm.pr_body) {
    llm.pr_body = appendFallbackNote(llm.pr_body, fallbackReasons);
  }

  return { llm, aiUsed, fallbackReasons };
}
