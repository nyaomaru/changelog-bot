const PULL_URL_PR_NUMBER_RE =
  /\b(?<pullUrl>https?:\/\/[^\s)]+\/pull\/(?<prNumber>\d+)\b)/gi;
const PULL_LINK_SUFFIX_RE =
  /(?:\bin\s+)?\[#\d+\]\((?<pullUrl>https?:\/\/[^\s)]+\/pull\/(?<prNumber>\d+)\b[^)]*)\)(?:\s+by\s+@[\w-]+(?:\[bot\])?)?\s*$/i;
const PR_SUFFIX_RE =
  /(?:\bin\s+#(?<plain>\d+)\b|\(#(?<parenthesized>\d+)\))\s*$/i;
const AUTHOR_RE = /\sby\s@(?<author>[\w-]+(?:\[bot\])?)/i;

/** Repository identity used to validate authoritative pull request links. */
export type WhyRepository = {
  /** Repository owner or organization. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Web hostname used by pull request links. */
  host?: string;
};

type OwningPrReference = {
  /** Pull request number parsed from the authoritative reference. */
  prNumber: number;
  /** Start offset of metadata to remove from the rendered item text. */
  startIndex: number;
  /** End offset of metadata to remove from the rendered item text. */
  endIndex: number;
};

/** Parsed changelog bullet associated with an authoritative pull request. */
export type ParsedWhyBullet = {
  /** Pull request that owns the changelog bullet. */
  prNumber: number;
  /** Bullet text with only generated PR metadata removed. */
  itemText: string;
  /** Optional author attached to generated release-note bullets. */
  author?: string;
};

function cleanItemText(line: string, reference: OwningPrReference): string {
  const lineWithoutOwningReference = `${line.slice(0, reference.startIndex)}${line.slice(reference.endIndex)}`;
  return lineWithoutOwningReference
    .replace(/^[-*]\s+/, '')
    .replace(/\sby\s@[\w-]+(?:\[bot\])?/gi, '')
    .replace(/\s*(?:in\s+)?\[#\d+\]\(\)/gi, '')
    .trim();
}

function isCurrentRepositoryPullUrl(
  pullUrl: string | undefined,
  repository: WhyRepository,
): boolean {
  if (!pullUrl) return false;
  try {
    const parsedUrl = new URL(pullUrl);
    const expectedHost = repository.host ?? 'github.com';
    if (parsedUrl.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
      return false;
    }
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    return (
      pathSegments[0]?.toLowerCase() === repository.owner.toLowerCase() &&
      pathSegments[1]?.toLowerCase() === repository.repo.toLowerCase() &&
      pathSegments[2]?.toLowerCase() === 'pull' &&
      /^\d+$/.test(pathSegments[3] ?? '')
    );
  } catch {
    return false;
  }
}

function parsePrNumber(rawNumber: string | undefined): number | null {
  if (!rawNumber) return null;
  const prNumber = Number.parseInt(rawNumber, 10);
  return Number.isSafeInteger(prNumber) ? prNumber : null;
}

function extractOwningPrReference(
  line: string,
  repository: WhyRepository,
): OwningPrReference | null {
  const suffixMatch = PR_SUFFIX_RE.exec(line);
  const suffixPrNumber = parsePrNumber(
    suffixMatch?.groups?.plain ?? suffixMatch?.groups?.parenthesized,
  );
  if (suffixMatch && suffixPrNumber) {
    return {
      prNumber: suffixPrNumber,
      startIndex: suffixMatch.index,
      endIndex: suffixMatch.index + suffixMatch[0].length,
    };
  }

  const linkedSuffixMatch = PULL_LINK_SUFFIX_RE.exec(line);
  const linkedSuffixPrNumber = parsePrNumber(
    linkedSuffixMatch?.groups?.prNumber,
  );
  if (
    linkedSuffixMatch &&
    linkedSuffixPrNumber &&
    isCurrentRepositoryPullUrl(linkedSuffixMatch.groups?.pullUrl, repository)
  ) {
    return {
      prNumber: linkedSuffixPrNumber,
      startIndex: linkedSuffixMatch.index,
      endIndex: linkedSuffixMatch.index + linkedSuffixMatch[0].length,
    };
  }

  const pullUrlMatches = Array.from(
    line.matchAll(PULL_URL_PR_NUMBER_RE),
  ).filter((match) =>
    isCurrentRepositoryPullUrl(match.groups?.pullUrl, repository),
  );
  const lastPullUrlMatch = pullUrlMatches[pullUrlMatches.length - 1];
  const pullUrlPrNumber = parsePrNumber(lastPullUrlMatch?.groups?.prNumber);
  if (lastPullUrlMatch && pullUrlPrNumber) {
    return {
      prNumber: pullUrlPrNumber,
      startIndex: lastPullUrlMatch.index,
      endIndex: lastPullUrlMatch.index + lastPullUrlMatch[0].length,
    };
  }

  // WHY: A prose `#123` may identify an issue or a different PR. Fetch only
  // references whose position or URL establishes that they own this bullet.
  return null;
}

/**
 * Parse a changelog bullet with an authoritative current-repository PR reference.
 * WHY: PR identification and metadata removal share the same accepted forms so
 * prose issue references and external PR URLs remain part of the item text.
 * @param line Markdown bullet line.
 * @param repository Repository whose pull requests are authoritative.
 * @returns Parsed bullet or null when no authoritative PR target exists.
 */
export function parseWhyBullet(
  line: string,
  repository: WhyRepository,
): ParsedWhyBullet | null {
  const reference = extractOwningPrReference(line, repository);
  if (!reference) return null;
  return {
    prNumber: reference.prNumber,
    itemText: cleanItemText(line, reference),
    author: AUTHOR_RE.exec(line)?.groups?.author,
  };
}
