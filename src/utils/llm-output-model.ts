import { buildLLMInput } from '@/lib/prompt.js';
import { parseOrRetryLLMOutput } from '@/utils/llm-parse.js';
import { fallbackSection } from '@/utils/fallback.js';
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
  applyLlmDefaults,
  buildAutoPrBody,
} from '@/utils/llm-output-common.js';
import { LlmError } from '@/lib/errors.js';

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
    provider,
    hasProviderKey,
    noAi,
    failOnLlmError,
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
    language,
    customInstructions,
  });

  let aiUsed = false;
  let llm: LLMOutput | null = null;

  if (noAi) {
    // The caller has already recorded the flag in fallbackReasons.
  } else if (!hasProviderKey) {
    fallbackReasons.push(`Missing API key for provider: ${provider.name}`);
  } else {
    try {
      llm = await parseOrRetryLLMOutput(provider, llmInput);
      aiUsed = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (failOnLlmError) {
        throw err instanceof Error ? err : new LlmError(`LLM generation failed: ${message}`);
      }
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

  if (!aiUsed && llm.pr_body) {
    llm.pr_body = appendFallbackNote(llm.pr_body, fallbackReasons);
  }

  return { llm, aiUsed, fallbackReasons };
}
