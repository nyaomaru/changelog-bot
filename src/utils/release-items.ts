import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type {
  ExcludedReleaseChange,
  ReleaseChange,
  ReleaseChangeId,
  ReleaseChangeOrigin,
  ReleaseItem,
} from '@/types/release.js';
import { detectPrSubChangesFromCommits } from '@/utils/sub-changes.js';
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
    case 'pull-request-subchange':
      return `pr:${origin.number}:c${origin.subIndex}`;
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
 * Assign stable identities to items parsed from ordered release notes before transforms.
 * WHY: Display titles may be duplicated or rewritten, so downstream stages need an
 * identity that does not depend on title matching. The first occurrence of a pull request
 * receives a PR-based identity, while duplicate references receive position-based
 * release-note identities to prevent ID collisions and enable tracking in excludedChanges.
 * @param items Parsed release-note items in source order.
 * @returns Pre-transform release changes with unique identities.
 */
export function buildIdentifiedReleaseItems(
  items: readonly ReleaseItem[],
): ReleaseChange[] {
  const seenPrNumbers = new Set<number>();
  return items.map((item, itemIndex) => {
    let origin: ReleaseChangeOrigin;
    if (item.pr !== undefined && !seenPrNumbers.has(item.pr)) {
      seenPrNumbers.add(item.pr);
      origin = { kind: 'pull-request', number: item.pr };
    } else {
      origin = { kind: 'release-note', index: itemIndex };
    }
    return {
      ...item,
      id: buildReleaseChangeId(origin),
      origin,
    };
  });
}

/**
 * Assign stable identities to items parsed from ordered release notes.
 * WHY: Display titles may be duplicated or rewritten, so downstream stages
 * need an identity that does not depend on title matching.
 * @param items Parsed release-note items in source order.
 * @param excludedChanges Optional collector for tracked duplicate exclusions.
 * @returns Canonical release changes with PR- or position-based identities.
 */
export function identifyReleaseItems(
  items: readonly ReleaseItem[],
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  const changes = buildIdentifiedReleaseItems(items);
  return deduplicateReleaseChangesByPullRequest(changes, excludedChanges);
}

/**
 * Deduplicate canonical changes by their final enriched pull request number.
 * WHY: Title-based enrichment runs after initial identification and can reveal
 * that separately parsed release-note rows refer to the same pull request.
 * @param changes Canonical changes after any available PR enrichment.
 * @param excludedChanges Optional collector for tracked duplicate exclusions.
 * @returns Source-ordered changes containing at most one entry per PR number.
 */
export function deduplicateReleaseChangesByPullRequest(
  changes: readonly ReleaseChange[],
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  const deduplicatedChanges: ReleaseChange[] = [];
  const changesByPrNumber = new Map<number, ReleaseChange>();
  const changesById = new Map<ReleaseChangeId, ReleaseChange>();

  for (const change of changes) {
    if (change.pr === undefined) {
      deduplicatedChanges.push(change);
      continue;
    }

    if (change.origin.kind === 'pull-request-subchange') {
      const existingChange = changesById.get(change.id);
      if (existingChange) {
        existingChange.author ??= change.author;
        existingChange.url ??= change.url;
        // WHY: Sibling occurrences of the exact same sub-change ID are dropped from changes
        // but must NOT be added to excludedChanges with the same ID, because validateReleaseResult
        // enforces strict disjointness between changes and excludedChanges.
        continue;
      }
      changesById.set(change.id, change);
      deduplicatedChanges.push(change);
      continue;
    }

    const existingChange = changesByPrNumber.get(change.pr);
    if (existingChange) {
      // Keep the first display entry while retaining metadata found later.
      existingChange.author ??= change.author;
      existingChange.url ??= change.url;
      if (excludedChanges && change.id !== existingChange.id) {
        excludedChanges.push({
          change,
          reason: 'duplicate',
          detail: `Duplicate change for PR #${change.pr}`,
        });
      }
      continue;
    }

    changesByPrNumber.set(change.pr, change);
    deduplicatedChanges.push(change);
  }

  return deduplicatedChanges;
}

/**
 * Assign stable commit-based identities to commits in the release range before transforms.
 * WHY: Establishes an independent pre-transform ledger for commit-based sources, ensuring
 * that every commit subsequently replaced by or collapsed into a PR item is accounted for.
 * @param commits Commits included in the release range.
 * @returns Pre-transform release changes with unique commit identities.
 */
export function buildCommitReleaseChanges(
  commits: readonly CommitLite[],
): ReleaseChange[] {
  return commits.map((commit) => {
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

/**
 * Build release items from authoritative commit-to-PR associations.
 * WHY: HEAD may have no release body, while its commits already belong to an
 * open PR whose title and author are the stable parent changelog item.
 * @param commits Commits included in the release range.
 * @param pullRequestsBySha Pull request metadata keyed by commit SHA.
 * @param excludedChanges Optional collector for commits collapsed into parent PRs.
 * @returns PR-level and unmapped commit items, or an empty array without PR metadata.
 */
export function buildReleaseItemsFromPullRequests(
  commits: readonly CommitLite[],
  pullRequestsBySha: Readonly<Record<string, readonly PullRef[]>>,
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  if (commits.length === 0) return [];

  // Group commits by associated pull request number
  const commitsByPrNumber = new Map<
    number,
    { pullRequest: PullRef; commits: CommitLite[] }
  >();
  for (const commit of commits) {
    const pullRequest = pullRequestsBySha[commit.sha]?.find((candidate) =>
      candidate.title?.trim(),
    );
    if (pullRequest?.title) {
      let entry = commitsByPrNumber.get(pullRequest.number);
      if (!entry) {
        entry = { pullRequest, commits: [] };
        commitsByPrNumber.set(pullRequest.number, entry);
      }
      entry.commits.push(commit);
    }
  }

  const items: ReleaseChange[] = [];
  const processedPrNumbers = new Set<number>();
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

    if (!processedPrNumbers.has(pullRequest.number)) {
      processedPrNumbers.add(pullRequest.number);
      const prEntry = commitsByPrNumber.get(pullRequest.number)!;
      const subChanges = detectPrSubChangesFromCommits(
        pullRequest.number,
        prEntry.pullRequest.title ?? '',
        prEntry.commits,
      );

      if (subChanges && subChanges.length >= 2) {
        for (const sub of subChanges) {
          const origin: ReleaseChangeOrigin = {
            kind: 'pull-request-subchange',
            number: pullRequest.number,
            subIndex: sub.subIndex,
            commitSha: sub.commitSha,
          };
          items.push({
            id: buildReleaseChangeId(origin),
            origin,
            title: sub.title,
            rawTitle: sub.rawTitle,
            author: pullRequest.author,
            pr: pullRequest.number,
            url: pullRequest.url,
          });
        }
      } else {
        const origin: ReleaseChangeOrigin = {
          kind: 'pull-request',
          number: pullRequest.number,
        };
        items.push({
          id: buildReleaseChangeId(origin),
          origin,
          title: stripConventionalPrefix(pullRequest.title),
          rawTitle: pullRequest.title,
          author: pullRequest.author,
          pr: pullRequest.number,
          url: pullRequest.url,
        });
      }
    }

    // WHY: Every source commit replaced by a PR-level item or sub-change must be recorded
    // in excludedChanges with an explicit reason so that the pre-transform commit ledger
    // is independently and completely accounted for.
    if (excludedChanges) {
      const commitOrigin: ReleaseChangeOrigin = {
        kind: 'commit',
        sha: commit.sha,
      };
      excludedChanges.push({
        change: {
          id: buildReleaseChangeId(commitOrigin),
          origin: commitOrigin,
          title: stripConventionalPrefix(commit.subject),
          rawTitle: commit.subject,
          pr: pullRequest.number,
          url: pullRequest.url,
        },
        reason: 'collapsed-into-pr',
        detail: `Commit ${commit.sha} collapsed into PR #${pullRequest.number}`,
      });
    }
  }

  return foundPullRequest ? items : [];
}
