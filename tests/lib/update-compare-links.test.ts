// @ts-nocheck
import { test, expect } from '@jest/globals';
import { updateCompareLinks } from '@/lib/changelog.js';

test('appends compare link if missing', () => {
  const base = '# Changelog\n\nSome content';

  const out = updateCompareLinks(
    base,
    '[v1.2.3]: https://example.com/compare/v1.2.2...v1.2.3',
  );

  expect(out).toMatch(
    /\n\n\[v1\.2\.3\]: https:\/\/example\.com\/compare\/v1\.2\.2\.\.\.v1\.2\.3\n?$/,
  );
});

test('updates existing Unreleased link', () => {
  const existing = `# Changelog\n\n[Unreleased]: https://example.com/old\n`;

  const out = updateCompareLinks(
    existing,
    undefined,
    '[Unreleased]: https://example.com/compare/v1.2.3...HEAD',
  );

  expect(
    out.includes('[Unreleased]: https://example.com/compare/v1.2.3...HEAD'),
  ).toBe(true);
  expect(out.includes('https://example.com/old')).toBe(false);
});

test('adds Unreleased link when absent and avoids duplicates', () => {
  const existing = '# Changelog\n';
  const unreleased = '[Unreleased]: https://example.com/compare/v1.2.3...HEAD';

  const once = updateCompareLinks(existing, undefined, unreleased);
  const twice = updateCompareLinks(once, undefined, unreleased);
  const matches = twice.match(/^\[Unreleased\]: .+$/gm) || [];

  expect(matches.length).toBe(1);
});
