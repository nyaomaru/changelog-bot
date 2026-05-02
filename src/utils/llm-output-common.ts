import { normalizeSectionCategories } from '@/utils/section-normalize.js';
import {
  DEFAULT_PR_LABELS,
  PR_TITLE_PREFIX,
  UNRELEASED_ANCHOR,
} from '@/constants/changelog.js';
import { isNumber } from '@/utils/is.js';
import type { LLMOutput } from '@/types/llm.js';
import type { TitleToPrMap } from '@/types/changelog-output.js';

export function buildPrUrl(
  owner: string,
  repo: string,
  prNumber: number,
): string {
  return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
}

export function buildAutoPrBody(
  prevRef: string,
  releaseRef: string,
  isFallback: boolean,
): string {
  const prefix = isFallback
    ? 'Auto-generated CHANGELOG (fallback)'
    : 'Auto-generated CHANGELOG';
  return `${prefix}. Range: \`${prevRef}..${releaseRef}\``;
}

export function appendFallbackNote(
  prBody: string,
  fallbackReasons: string[],
): string {
  const reasonNote = fallbackReasons.length
    ? `\n\nNote: Generated without LLM. Reason: ${fallbackReasons.join('; ')}.`
    : `\n\nNote: Generated without LLM.`;
  return `${prBody}${reasonNote}`;
}

export function resolvePrFromTitles(
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

export function applyLlmDefaults(
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
  if (!output.insert_after_anchor) {
    output.insert_after_anchor = UNRELEASED_ANCHOR;
  }
  if (!output.labels) output.labels = [...DEFAULT_PR_LABELS];
  return output;
}
