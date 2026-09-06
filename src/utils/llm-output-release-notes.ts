import { fetchPRInfo } from '@/lib/github.js';
import {
  buildReleaseItemsFromPullRequests,
  deduplicateReleaseChangesByPullRequest,
  identifyReleaseItems,
  parseReleaseNotes,
  buildSectionFromRelease,
} from '@/utils/release.js';
import { applyDeterministicClassification } from '@/utils/deterministic-classification.js';
import { buildChangesForClassification } from '@/utils/classify-pre.js';
import {
  fallbackCategoryAssignments,
  IncompleteClassificationError,
} from '@/providers/classification.js';
import { LlmError } from '@/lib/errors.js';
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
import { isError } from '@/utils/is.js';
import type { ReleaseChange } from '@/types/release.js';
import type { CategoryAssignments } from '@/types/changelog.js';

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
  items: ReleaseChange[];
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
    noAi,
    failOnLlmError,
    token,
    githubApiBase,
  } = params;

  const parsedRelease = parseReleaseNotes(releaseBody, { owner, repo });
  let releaseChanges = identifyReleaseItems(parsedRelease.items);
  let usedPullRequestMetadata = false;
  if (!releaseChanges.length && !parsedRelease.sections?.length) {
    releaseChanges = buildReleaseItemsFromPullRequests(
      params.commitList,
      params.pullRequestsBySha ?? {},
    );
    usedPullRequestMetadata = releaseChanges.length > 0;
  }
  const hasAdditionalSections = Boolean(parsedRelease.sections?.length);
  if (!releaseChanges.length && !hasAdditionalSections) return null;

  fallbackReasons.push(
    usedPullRequestMetadata
      ? 'Used GitHub pull request metadata as the source (no generation model call)'
      : 'Used GitHub Release Notes as the source (no model call)',
  );
  let aiUsed = false;

  await enrichReleaseItems({
    owner,
    repo,
    token,
    githubApiBase,
    titleToPr,
    items: releaseChanges,
  });
  releaseChanges = deduplicateReleaseChangesByPullRequest(releaseChanges);

  const changesForClassification =
    buildChangesForClassification(releaseChanges);
  let assignments = {} as CategoryAssignments;
  if (changesForClassification.length) {
    if (noAi) {
      assignments = fallbackCategoryAssignments(changesForClassification);
    } else {
      try {
        const classification = await provider.classifyChanges(
          changesForClassification,
          {
            throwOnError: true,
          },
        );
        assignments = classification.assignments;
        fallbackReasons.push(...classification.diagnostics);
        // Mark AI usage only when classification had input and a provider key is available.
        aiUsed = aiUsed || hasProviderKey;
      } catch (err) {
        if (err instanceof IncompleteClassificationError && !failOnLlmError) {
          assignments = err.result.assignments;
          fallbackReasons.push(...err.result.diagnostics);
          aiUsed = aiUsed || hasProviderKey;
        } else {
          const message = isError(err) ? err.message : String(err);
          if (failOnLlmError) {
            throw new LlmError(`LLM classification failed: ${message}`);
          }
          fallbackReasons.push(`LLM classification failed: ${message}`);
          assignments = fallbackCategoryAssignments(changesForClassification);
        }
      }
    }
    assignments = applyDeterministicClassification(
      releaseChanges,
      assignments,
      changesForClassification,
    );
  }

  const section = buildSectionFromRelease({
    version,
    date,
    changes: releaseChanges,
    assignments,
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
