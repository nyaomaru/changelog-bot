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
  const changes = items.map((item, itemIndex) => {
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

  return deduplicateReleaseChangesByPullRequest(changes);
}

/**
 * Deduplicate canonical changes by their final enriched pull request number.
 * WHY: Title-based enrichment runs after initial identification and can reveal
 * that separately parsed release-note rows refer to the same pull request.
 * @param changes Canonical changes after any available PR enrichment.
 * @returns Source-ordered changes containing at most one entry per PR number.
 */
export function deduplicateReleaseChangesByPullRequest(
  changes: readonly ReleaseChange[],
): ReleaseChange[] {
  const deduplicatedChanges: ReleaseChange[] = [];
  const changesByPrNumber = new Map<number, ReleaseChange>();

  for (const change of changes) {
    if (change.pr === undefined) {
      deduplicatedChanges.push(change);
      continue;
    }

    const existingChange = changesByPrNumber.get(change.pr);
    if (existingChange) {
      // Keep the first display entry while retaining metadata found later.
      existingChange.author ??= change.author;
      existingChange.url ??= change.url;
      continue;
    }

    changesByPrNumber.set(change.pr, change);
    deduplicatedChanges.push(change);
  }

  return deduplicatedChanges;
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
