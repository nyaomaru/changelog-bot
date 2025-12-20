// @ts-nocheck
import { test, expect } from '@jest/globals';
import { computeChangelog } from '@/lib/changelog.js';

test('inserts new version when missing (after Unreleased)', () => {
  const current = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [v0.9.0]',
    '- old',
    '',
  ].join('\n');

  const v = '1.0.0';
  const newSection = ['## [v1.0.0]', '- new'].join('\n');

  const out = computeChangelog(current, {
    version: v,
    newSection,
    insertAfterAnchor: '## [Unreleased]',
  });

  const idxNew = out.indexOf('## [v1.0.0]');
  const idxOld = out.indexOf('## [v0.9.0]');
  expect(idxNew).toBeGreaterThan(-1);
  expect(idxOld).toBeGreaterThan(-1);
  expect(idxNew).toBeLessThan(idxOld);
});

test('replaces existing version content', () => {
  const current = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [v1.0.0]',
    '- old',
    '',
  ].join('\n');

  const out = computeChangelog(current, {
    version: '1.0.0',
    newSection: '## [v1.0.0]\n- new',
    insertAfterAnchor: '## [Unreleased]',
  });

  expect(out.includes('## [v1.0.0]\n- new')).toBe(true);
  expect(out.includes('- old')).toBe(false);
});

test('removes duplicates before applying new section', () => {
  const v = '2.0.0';
  const dupSection = `## [v${v}]\n- a`;
  const current = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    dupSection,
    '',
    dupSection,
    '',
  ].join('\n');

  const out = computeChangelog(current, {
    version: v,
    newSection: `## [v${v}]\n- only once`,
    insertAfterAnchor: '## [Unreleased]',
  });

  const reg = new RegExp(`^##\\s*\\[v${v}\\]`, 'gm');
  const count = (out.match(reg) || []).length;
  expect(count).toBe(1);
  expect(out.includes('- only once')).toBe(true);
});

test('compare link append and unreleased update', () => {
  const current = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [v1.0.0]',
    '- x',
    '',
    '[Unreleased]: https://example.com/old',
    '',
  ].join('\n');

  const compare = '[v1.1.0]: https://example.com/compare/v1.0.0...v1.1.0';
  const unreleased = '[Unreleased]: https://example.com/compare/v1.1.0...HEAD';

  const out = computeChangelog(current, {
    version: '1.1.0',
    newSection: '## [v1.1.0]\n- y',
    insertAfterAnchor: '## [Unreleased]',
    compareLine: compare,
    unreleasedLine: unreleased,
  });

  // Compare appended once
  const compareMatches = out.match(/^\[v1\.1\.0\]: .+$/gm) || [];
  expect(compareMatches.length).toBe(1);
  expect(out.includes(compare)).toBe(true);

  // Unreleased replaced
  expect(out.includes(unreleased)).toBe(true);
  expect(out.includes('https://example.com/old')).toBe(false);

  // Idempotent on re-run
  const again = computeChangelog(out, {
    version: '1.1.0',
    newSection: '## [v1.1.0]\n- y (updated)',
    insertAfterAnchor: '## [Unreleased]',
    compareLine: compare,
    unreleasedLine: unreleased,
  });
  const compareMatches2 = again.match(/^\[v1\.1\.0\]: .+$/gm) || [];
  expect(compareMatches2.length).toBe(1);
});

