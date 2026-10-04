import { buildLLMInput } from '@/lib/prompt.js';
import { parseOrRetryLLMOutput } from '@/utils/llm-parse.js';
import { buildReleaseDraft } from '@/utils/release-draft.js';
import { buildSectionFromRelease } from '@/utils/release-section.js';
import { reconcileEditorialOutput } from '@/utils/editorial.js';
import {
  DEFAULT_PR_LABELS,
  PR_TITLE_PREFIX,
  UNRELEASED_ANCHOR,
} from '@/constants/changelog.js';
import { SHA_SHORT_LENGTH } from '@/constants/git.js';
import type {
  BuildChangelogLlmOutputParams,
  BuildLlmOutputResult,
} from '@/types/changelog-output.js';
import type { CommitLite } from '@/types/commit.js';
import type { LLMOutput } from '@/types/llm.js';
import {
  appendFallbackNote,
  buildAutoPrBody,
} from '@/utils/llm-output-common.js';
import { LlmError } from '@/lib/errors.js';
import { isError } from '@/utils/is.js';

function buildLogsForLLM(
  commitList: CommitLite[],
  prMapBySha: BuildChangelogLlmOutputParams['prMapBySha'],
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

/**
 * Build changelog output using deterministic draft and optional provider generation.
 * WHY: In Phase 4, the deterministic ReleaseDraft is always constructed first and validated.
 * When AI generation is enabled, it enhances the changelog while deterministic fallbacks
 * use the canonical ReleaseDraft renderer instead of raw unclassified logs.
 * @param params Input release context, commits, and provider configuration.
 * @param fallbackReasons List of diagnostics describing missing keys or degraded enrichment.
 * @returns LLM output payload, release draft, and AI usage metadata.
 */
export async function buildOutputFromModelOrFallback(
  params: BuildChangelogLlmOutputParams,
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
    language,
    customInstructions,
    existingChangelog,
    commitList,
    prs,
    prMapBySha,
    pullRequestsBySha,
    titleToPr,
    provider,
    hasProviderKey,
    noAi,
    failOnLlmError,
  } = params;

  // Phase 4: Construct authoritative deterministic ReleaseDraft before any model call
  const draft = buildReleaseDraft({
    version,
    date,
    releaseBody,
    commitList,
    pullRequestsBySha,
    titleToPr,
    owner,
    repo,
  });

  const logsForLLM = buildLogsForLLM(commitList, prMapBySha);
  const editorialChanges = draft.changes.map((change) => ({
    id: change.id,
    title: change.title,
    category: draft.assignments[change.id],
  }));

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
    language,
    customInstructions,
    changes: editorialChanges,
  });

  let aiUsed = false;
  let activeDraft = draft;

  if (noAi) {
    // The caller has already recorded the flag in fallbackReasons.
  } else if (!hasProviderKey) {
    fallbackReasons.push(`Missing API key for provider: ${provider.name}`);
  } else {
    try {
      const editorial = await parseOrRetryLLMOutput(provider, llmInput);
      aiUsed = true;
      const reconciled = reconcileEditorialOutput(draft, editorial);
      activeDraft = reconciled.result;
      fallbackReasons.push(...reconciled.diagnostics);
    } catch (err) {
      const message = isError(err) ? err.message : String(err);
      if (failOnLlmError) {
        throw isError(err)
          ? err
          : new LlmError(`LLM generation failed: ${message}`);
      }
      fallbackReasons.push(`LLM generation failed: ${message}`);
    }
  }

  // Phase 4: Deterministic renderer is the sole Markdown author for both AI and fallback paths
  const section = buildSectionFromRelease({
    ...activeDraft,
  });

  const llm: LLMOutput = {
    new_section_markdown: section,
    insert_after_anchor: UNRELEASED_ANCHOR,
    pr_title: `${PR_TITLE_PREFIX}${version}`,
    pr_body: buildAutoPrBody(prevRef, releaseRef, !aiUsed),
    labels: [...DEFAULT_PR_LABELS],
  };

  if (!aiUsed && llm.pr_body) {
    llm.pr_body = appendFallbackNote(llm.pr_body, fallbackReasons);
  }

  return { llm, draft: activeDraft, aiUsed, fallbackReasons };
}
