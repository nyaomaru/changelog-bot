import { fetchPRInfo } from '@/lib/github.js';
import {
  buildIdentifiedReleaseItems,
  buildReleaseItemsFromPullRequests,
  deduplicateReleaseChangesByPullRequest,
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
import type {
  ExcludedReleaseChange,
  ReleaseChange,
  ReleaseDraft,
} from '@/types/release.js';
import type { CategoryAssignments } from '@/types/changelog.js';
import { validateReleaseResult } from '@/utils/release-validation.js';

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
  const excludedChanges: ExcludedReleaseChange[] = [];
  let sourceChanges: ReleaseChange[] = [];
  let releaseChanges: ReleaseChange[] = [];

  if (parsedRelease.items.length) {
    const identified = buildIdentifiedReleaseItems(parsedRelease.items);
    sourceChanges = [...identified];
    releaseChanges = deduplicateReleaseChangesByPullRequest(
      identified,
      excludedChanges,
    );
  }

  let usedPullRequestMetadata = false;
  if (!releaseChanges.length && !parsedRelease.sections?.length) {
    releaseChanges = buildReleaseItemsFromPullRequests(
      params.commitList,
      params.pullRequestsBySha ?? {},
      excludedChanges,
    );
    if (releaseChanges.length > 0) {
      sourceChanges = [
        ...releaseChanges,
        ...excludedChanges.map((entry) => entry.change),
      ];
    }
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
  releaseChanges = deduplicateReleaseChangesByPullRequest(
    releaseChanges,
    excludedChanges,
  );

  const changesForClassification =
    buildChangesForClassification(releaseChanges);

  // Phase 4: Construct authoritative deterministic ReleaseDraft upfront as the baseline
  const baselineAssignments: CategoryAssignments =
    changesForClassification.length
      ? applyDeterministicClassification(
          releaseChanges,
          fallbackCategoryAssignments(changesForClassification),
          changesForClassification,
        )
      : ({} as CategoryAssignments);

  const draft: ReleaseDraft = {
    version,
    date,
    changes: releaseChanges,
    assignments: baselineAssignments,
    excludedChanges,
    fullChangelog: parsedRelease.fullChangelog,
    sections: parsedRelease.sections,
    sourceChanges,
  };

  let activeDraft = draft;

  if (changesForClassification.length && !noAi) {
    try {
      const classification = await provider.classifyChanges(
        changesForClassification,
        {
          throwOnError: true,
        },
      );
      const aiAssignments = applyDeterministicClassification(
        releaseChanges,
        classification.assignments,
        changesForClassification,
      );
      activeDraft = {
        ...draft,
        assignments: aiAssignments,
      };
      fallbackReasons.push(...classification.diagnostics);
      // Mark AI usage only when classification had input and a provider key is available.
      aiUsed = aiUsed || hasProviderKey;
    } catch (err) {
      if (err instanceof IncompleteClassificationError && !failOnLlmError) {
        const partialAssignments = applyDeterministicClassification(
          releaseChanges,
          err.result.assignments,
          changesForClassification,
        );
        activeDraft = {
          ...draft,
          assignments: partialAssignments,
        };
        fallbackReasons.push(...err.result.diagnostics);
        aiUsed = aiUsed || hasProviderKey;
      } else {
        const message = isError(err) ? err.message : String(err);
        if (failOnLlmError) {
          throw new LlmError(`LLM classification failed: ${message}`);
        }
        fallbackReasons.push(`LLM classification failed: ${message}`);
        // Degradation gracefully retains baseline draft assignments
      }
    }
  }

  // Phase 5: Enforce completeness and empty-release behavior via validateReleaseResult
  const outcome = validateReleaseResult(activeDraft, sourceChanges);

  const section =
    outcome.kind === 'release'
      ? buildSectionFromRelease({
          ...activeDraft,
        })
      : '';

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

  return { llm, draft: activeDraft, aiUsed, fallbackReasons, outcome };
}
