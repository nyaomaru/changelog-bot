import {
  normalizeTitle,
  stripConventionalPrefix,
} from '@/utils/title-normalize.js';

/** Case-insensitive and normalized title lookup tables. */
export type TitleLookup<Value> = {
  /** Direct lookup keyed by original, lowercase, and stripped title variants. */
  direct: Map<string, Value>;
  /** Normalized lookup used for exact and fuzzy matching. */
  normalized: Map<string, Value>;
};

/** Collision context for normalized-title lookups. */
export type TitleLookupCollision<Value> = {
  /** Original entry title that produced the collision. */
  title: string;
  /** Normalized title key shared by both entries. */
  normalizedTitle: string;
  /** Existing value already stored for the normalized key. */
  existingValue: Value;
  /** Incoming value competing for the same normalized key. */
  incomingValue: Value;
};

type BuildTitleLookupOptions<Value> = {
  /** Optional resolver for normalized-title collisions. */
  onNormalizedCollision?: (
    collision: TitleLookupCollision<Value>,
  ) => Value | undefined;
};

type FindTitleMatchOptions = {
  /** Minimum shared prefix ratio required for fuzzy prefix matching. */
  minRelativePrefixLength?: number;
};

function buildDirectKeys(title: string): string[] {
  const strippedTitle = stripConventionalPrefix(title);
  return [
    ...new Set([
      title,
      title.toLowerCase(),
      strippedTitle,
      strippedTitle.toLowerCase(),
    ]),
  ];
}

/**
 * Build direct and normalized title lookup tables for later fuzzy matching.
 * @param entries Title/value pairs to index.
 * @param options Optional collision policy for normalized keys.
 * @returns Lookup tables that support exact and fuzzy title resolution.
 */
export function buildTitleLookup<Value>(
  entries: Iterable<{ titles: Iterable<string>; value: Value }>,
  options: BuildTitleLookupOptions<Value> = {},
): TitleLookup<Value> {
  const direct = new Map<string, Value>();
  const normalized = new Map<string, Value>();

  for (const entry of entries) {
    for (const title of entry.titles) {
      if (!title) continue;

      for (const key of buildDirectKeys(title)) {
        direct.set(key, entry.value);
      }

      const normalizedTitle = normalizeTitle(title);
      if (!normalizedTitle) continue;

      const existingValue = normalized.get(normalizedTitle);
      if (existingValue !== undefined && options.onNormalizedCollision) {
        const resolvedValue = options.onNormalizedCollision({
          title,
          normalizedTitle,
          existingValue,
          incomingValue: entry.value,
        });
        if (resolvedValue !== undefined) {
          normalized.set(normalizedTitle, resolvedValue);
        }
        continue;
      }

      if (existingValue === undefined) {
        normalized.set(normalizedTitle, entry.value);
      }
    }
  }

  return { direct, normalized };
}

/**
 * Resolve a title against direct and normalized lookup tables.
 * @param title Raw title to find.
 * @param lookup Lookup tables built by `buildTitleLookup`.
 * @param options Matching options.
 * @returns Matched value when one is found.
 */
export function findTitleMatch<Value>(
  title: string,
  lookup: TitleLookup<Value>,
  options: FindTitleMatchOptions = {},
): Value | undefined {
  if (!title) return undefined;

  const normalizedTitle = normalizeTitle(title);
  if (normalizedTitle) {
    // WHY: Collision resolution is recorded in the normalized table, so exact
    // normalized hits must win over direct-key matches to keep lookups stable
    // across punctuation, casing, and conventional-prefix variants.
    const exactMatch = lookup.normalized.get(normalizedTitle);
    if (exactMatch !== undefined) return exactMatch;
  }

  for (const key of buildDirectKeys(title)) {
    const directMatch = lookup.direct.get(key);
    if (directMatch !== undefined) return directMatch;
  }

  if (!normalizedTitle) return undefined;

  const minRelativePrefixLength = options.minRelativePrefixLength ?? 0;
  for (const [lookupTitle, value] of lookup.normalized) {
    const minLength = Math.min(lookupTitle.length, normalizedTitle.length);
    const maxLength = Math.max(lookupTitle.length, normalizedTitle.length);
    if (maxLength === 0) continue;
    if (minLength / maxLength < minRelativePrefixLength) continue;
    if (
      normalizedTitle.startsWith(lookupTitle) ||
      lookupTitle.startsWith(normalizedTitle)
    ) {
      return value;
    }
  }

  return undefined;
}
