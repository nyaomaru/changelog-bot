import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type {
  ReleaseChange,
  ReleaseChangeOrigin,
  ReleaseDraft,
} from '@/types/release.js';
import {
  buildReleaseItemsFromPullRequests,
  deduplicateReleaseChangesByPullRequest,
  identifyReleaseItems,
  buildReleaseChangeId,
} from '@/utils/release-items.js';
import { parseReleaseNotes } from '@/utils/release-notes.js';
import { stripConventionalPrefix } from '@/utils/title-normalize.js';
import { buildChangesForClassification } from '@/utils/classify-pre.js';
import {
  applyDeterministicClassification,
  classifyChangesDeterministically,
} from '@/utils/deterministic-classification.js';
import { buildPrUrl, resolvePrFromTitles } from '@/utils/llm-output-common.js';

export type BuildReleaseDraftParams = {
  /** Target release version string without leading 'v'. */
  version: string;
  /** Release date formatted as YYYY-MM-DD. */
  date: string;
  /** GitHub release notes body text if provided. */
  releaseBody?: string;
  /** Commits included in the release range. */
  commitList: readonly CommitLite[];
  /** Pull requests mapped by commit SHA. */
  pullRequestsBySha?: Readonly<Record<string, readonly PullRef[]>>;
  /** Pull request numbers keyed by title. */
  titleToPr?: Record<string, number>;
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Optional full changelog compare URL. */
  fullChangelog?: string;
};

/**
 * Build a complete, valid ReleaseDraft before any optional AI calls.
 * WHY: Establishes the Phase 4 deterministic-first invariant. The resulting
 * draft is fully valid and usable even if all AI stages are disabled or fail.
 * @param params Source commits, PR references, and release metadata.
 * @returns Fully classified ReleaseDraft ready for rendering or enrichment.
 */
export function buildReleaseDraft(
  params: BuildReleaseDraftParams,
): ReleaseDraft {
  const {
    version,
    date,
    releaseBody,
    commitList,
    pullRequestsBySha = {},
    titleToPr = {},
    owner,
    repo,
  } = params;

  let changes: ReleaseChange[] = [];
  let fullChangelog = params.fullChangelog;
  let sections = undefined;

  if (releaseBody?.trim()) {
    const parsedRelease = parseReleaseNotes(releaseBody, { owner, repo });
    changes = identifyReleaseItems(parsedRelease.items);
    sections = parsedRelease.sections;
    if (parsedRelease.fullChangelog) {
      fullChangelog = parsedRelease.fullChangelog;
    }
  }

  if (changes.length === 0) {
    changes = buildReleaseItemsFromPullRequests(commitList, pullRequestsBySha);
  }

  if (changes.length === 0 && commitList.length > 0) {
    changes = commitList.map((commit) => {
      const origin: ReleaseChangeOrigin = {
        kind: 'commit',
        sha: commit.sha,
      };
      return {
        id: buildReleaseChangeId(origin),
        origin,
        title: stripConventionalPrefix(commit.subject),
        rawTitle: commit.subject,
      };
    });
  }

  // Backfill PR numbers from title mapping when missing
  for (const change of changes) {
    if (!change.pr) {
      const prNum = resolvePrFromTitles(titleToPr, [
        change.title,
        change.rawTitle,
      ]);
      if (prNum) {
        change.pr = prNum;
        change.url = buildPrUrl(owner, repo, prNum);
      }
    }
  }

  changes = deduplicateReleaseChangesByPullRequest(changes);

  // Deterministic classification across all changes
  const changesForClassification = buildChangesForClassification(changes);
  let assignments = classifyChangesDeterministically(changesForClassification);
  assignments = applyDeterministicClassification(
    changes,
    assignments,
    changesForClassification,
  );

  return {
    version,
    date,
    changes,
    assignments,
    fullChangelog,
    sections,
  };
}
