import { describe, expect, test } from '@jest/globals';
import { buildTitleLookup, findTitleMatch } from '@/utils/title-lookup.js';

describe('title-lookup utils', () => {
  test('matches direct titles after stripping conventional prefixes', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 42 },
    ]);

    expect(findTitleMatch('feat(auth): Add login flow', lookup)).toBe(42);
  });

  test('supports fuzzy prefix matching with a relative length threshold', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow with passwordless fallback'], value: 42 },
    ]);

    expect(
      findTitleMatch('Add login flow with passwordless', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBe(42);
    expect(
      findTitleMatch('Add', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBeUndefined();
  });

  test('uses the collision resolver for normalized title clashes', () => {
    const lookup = buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 42 },
        { titles: ['add-login-flow'], value: 99 },
      ],
      {
        onNormalizedCollision: ({ existingValue, incomingValue }) =>
          Math.max(existingValue, incomingValue),
      },
    );

    expect(findTitleMatch('Add login flow', lookup)).toBe(99);
    expect(findTitleMatch('Add! Login Flow', lookup)).toBe(99);
  });
});
