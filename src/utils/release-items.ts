import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type {
  ReleaseChange,
  ReleaseChangeId,
  ReleaseChangeOrigin,
  ReleaseItem,
} from '@/types/release.js';
import { stripConventionalPrefix } from '@/utils/title-normalize.js';

/**
 * Build a stable release-change ID from its source identity.
 * @param origin Source record for the release change.
 * @returns Stable ID suitable for provider reconciliation.
 */
export function buildReleaseChangeId(
  origin: ReleaseChangeOrigin,
): ReleaseChangeId {
  switch (origin.kind) {
    case 'pull-request':
      return `pr:${origin.number}`;
    case 'commit':
      return `commit:${origin.sha}`;
    case 'release-note':
      return `release-note:${origin.index}`;
    default: {
      const exhaustiveOrigin: never = origin;
      throw new Error(
        `Unsupported release-change origin: ${JSON.stringify(exhaustiveOrigin)}`,
      );
    }
  }
}

/**
 * Assign stable identities to items parsed from ordered release notes.
 * WHY: Display titles may be duplicated or rewritten, so downstream stages
 * need an identity that does not depend on title matching.
 * @param items Parsed release-note items in source order.
 * @returns Canonical release changes with PR- or position-based identities.
 */
export function identifyReleaseItems(
  items: readonly ReleaseItem[],
): ReleaseChange[] {
  return items.map((item, itemIndex) => {
    const origin: ReleaseChangeOrigin =
      item.pr !== undefined
        ? { kind: 'pull-request', number: item.pr }
        : { kind: 'release-note', index: itemIndex };
    return {
      ...item,
      id: buildReleaseChangeId(origin),
      origin,
    };
  });
}

/**
 * Build release items from authoritative commit-to-PR associations.
 * WHY: HEAD may have no release body, while its commits already belong to an
 * open PR whose title and author are the stable parent changelog item.
 * @param commits Commits included in the release range.
 * @param pullRequestsBySha Pull request metadata keyed by commit SHA.
 * @returns PR-level and unmapped commit items, or an empty array without PR metadata.
 */
export function buildReleaseItemsFromPullRequests(
  commits: readonly CommitLite[],
  pullRequestsBySha: Readonly<Record<string, readonly PullRef[]>>,
): ReleaseChange[] {
  if (commits.length === 0) return [];

  const items: ReleaseChange[] = [];
  const itemsByPrNumber = new Map<number, ReleaseChange>();
  let foundPullRequest = false;
  for (const commit of commits) {
    const pullRequest = pullRequestsBySha[commit.sha]?.find((candidate) =>
      candidate.title?.trim(),
    );
    if (!pullRequest?.title) {
      const origin: ReleaseChangeOrigin = {
        kind: 'commit',
        sha: commit.sha,
      };
      items.push({
        id: buildReleaseChangeId(origin),
        origin,
        title: stripConventionalPrefix(commit.subject),
        rawTitle: commit.subject,
      });
      continue;
    }

    foundPullRequest = true;
    let item = itemsByPrNumber.get(pullRequest.number);
    if (!item) {
      const origin: ReleaseChangeOrigin = {
        kind: 'pull-request',
        number: pullRequest.number,
      };
      item = {
        id: buildReleaseChangeId(origin),
        origin,
        title: stripConventionalPrefix(pullRequest.title),
        rawTitle: pullRequest.title,
        author: pullRequest.author,
        pr: pullRequest.number,
        url: pullRequest.url,
      };
      itemsByPrNumber.set(pullRequest.number, item);
      items.push(item);
    }
  }

  return foundPullRequest ? items : [];
}
