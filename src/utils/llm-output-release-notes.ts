import { fetchPRInfo } from '@/lib/github.js';
import { parseReleaseNotes, buildSectionFromRelease } from '@/utils/release.js';
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';
import { buildTitlesForClassification } from '@/utils/classify-pre.js';
import {
  DEFAULT_PR_LABELS,
  PR_TITLE_PREFIX,
  UNRELEASED_ANCHOR,
} from '@/constants/changelog.js';
import type { LLMOutput } from '@/types/llm.js';
import type {
  BuildChangelogLlmOutputParams,
  BuildLlmOutputResult,
} from '@/types/changelog-output.js';
import {
  appendFallbackNote,
  buildAutoPrBody,
  buildPrUrl,
  resolvePrFromTitles,
} from '@/utils/llm-output-common.js';

/**
 * Fill missing PR numbers/URLs/authors for release note items when possible.
 * WHY: Release notes omit metadata; we backfill via title mapping and GitHub API.
 */
async function enrichReleaseItems(params: {
  owner: string;
  repo: string;
  token?: string;
  githubApiBase: string;
  titleToPr: BuildChangelogLlmOutputParams['titleToPr'];
  items: Array<{
    title: string;
    rawTitle?: string;
    pr?: number;
    url?: string;
    author?: string;
  }>;
}): Promise<void> {
  const { owner, repo, token, githubApiBase, titleToPr, items } = params;

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
          const pr = await fetchPRInfo(
            owner,
            repo,
            item.pr,
            token,
            githubApiBase,
          );
          if (pr?.author) item.author = pr.author;
          if (pr?.url) item.url = pr.url;
        } catch {
          console.warn(`Warning: Failed to fetch PR #${item.pr} info`);
        }
      }
    }
  }
}

export async function buildOutputFromReleaseNotes(
  params: BuildChangelogLlmOutputParams,
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
    githubApiBase,
  } = params;

  const parsedRelease = parseReleaseNotes(releaseBody, { owner, repo });
  const hasAdditionalSections = Boolean(parsedRelease.sections?.length);
  if (!parsedRelease.items.length && !hasAdditionalSections) return null;

  fallbackReasons.push(
    'Used GitHub Release Notes as the source (no model call)',
  );
  let aiUsed = false;

  await enrichReleaseItems({
    owner,
    repo,
    token,
    githubApiBase,
    titleToPr,
    items: parsedRelease.items,
  });

  const titlesForLLM = buildTitlesForClassification(parsedRelease.items);
  let categories: Record<string, string[]> = {};
  if (titlesForLLM.length) {
    categories = await provider.classifyTitles(titlesForLLM);
    // Mark AI usage only when classification had input and a provider key is available.
    aiUsed = aiUsed || hasProviderKey;
    // Heuristic tuning: ensure typing/contract corrections are grouped under Fixed.
    categories = tuneCategoriesByTitle(parsedRelease.items, categories);
  }

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
