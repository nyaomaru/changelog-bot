import { computeChangelog, ensureCompareLinks } from '@/lib/changelog.js';
import type { LLMOutput } from '@/types/llm.js';
import { postprocessSection } from '@/utils/section-postprocess.js';
import { sanitizeLLMOutput } from '@/utils/sanitize.js';
import { FULL_CHANGELOG_RE } from '@/constants/release.js';

type TitleToPrMap = Record<string, number>;

/** Inputs required to finalize the generated changelog section. */
export type FinalizeChangelogUpdateParams = {
  /** Repository owner or org. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Release version without the leading `v`. */
  version: string;
  /** Previous ref used for compare links. */
  prevRef: string;
  /** Current release ref or tag. */
  releaseRef: string;
  /** Existing changelog content before the update. */
  existing: string;
  /** Structured LLM output to normalize and apply. */
  llm: LLMOutput;
  /** Title to PR number mapping used for section post-processing. */
  titleToPr: TitleToPrMap;
};

/** Finalized changelog artifacts ready for printing or writing to disk. */
export type FinalizeChangelogUpdateResult = {
  /** Sanitized LLM output after section post-processing. */
  llm: LLMOutput;
  /** Updated changelog content. */
  updated: string;
};

function ensureCompareLineInSection(
  sectionMarkdown: string,
  version: string,
  compareLine: string,
): string {
  const compareReference = `[v${version}]:`;
  if (sectionMarkdown.includes(compareReference)) return sectionMarkdown;
  return `${sectionMarkdown}\n${compareLine}`;
}

function ensureFullChangelogLine(
  sectionMarkdown: string,
  owner: string,
  repo: string,
  prevRef: string,
  releaseRef: string,
): string {
  if (FULL_CHANGELOG_RE.test(sectionMarkdown)) return sectionMarkdown;

  const fullChangelogUrl = `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(
    prevRef,
  )}...${encodeURIComponent(releaseRef)}`;
  return `${sectionMarkdown}\n**Full Changelog**: ${fullChangelogUrl}\n`;
}

/**
 * Sanitize the generated release section and compute the next changelog content.
 * WHY: Keeping post-processing and compare-link logic in one pure function
 * makes the CLI orchestration easier to read and easier to test.
 * @param params Existing changelog state and generated section metadata.
 * @returns Sanitized LLM output and the fully updated changelog text.
 */
export function finalizeChangelogUpdate(
  params: FinalizeChangelogUpdateParams,
): FinalizeChangelogUpdateResult {
  const { owner, repo, version, prevRef, releaseRef, existing, titleToPr } =
    params;

  const finalizedLlm = sanitizeLLMOutput(params.llm) as LLMOutput;
  finalizedLlm.new_section_markdown = postprocessSection(
    finalizedLlm.new_section_markdown,
    titleToPr,
    { owner, repo },
  );

  const { compareLine, unreleasedLine } = ensureCompareLinks({
    owner,
    repo,
    prevTag: prevRef,
    releaseRef,
    version,
    existing,
  });

  finalizedLlm.new_section_markdown = ensureCompareLineInSection(
    finalizedLlm.new_section_markdown,
    version,
    finalizedLlm.compare_link_line ?? compareLine,
  );
  finalizedLlm.new_section_markdown = ensureFullChangelogLine(
    finalizedLlm.new_section_markdown,
    owner,
    repo,
    prevRef,
    releaseRef,
  );

  const updated = computeChangelog(existing, {
    version,
    newSection: finalizedLlm.new_section_markdown,
    insertAfterAnchor: finalizedLlm.insert_after_anchor!,
    compareLine: undefined,
    unreleasedLine: finalizedLlm.unreleased_compare_update ?? unreleasedLine,
  });

  return {
    llm: finalizedLlm,
    updated,
  };
}
