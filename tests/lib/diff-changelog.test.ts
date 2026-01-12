// @ts-nocheck
import { test, expect } from '@jest/globals';
import { diffChangelog } from '@/lib/changelog.js';

test('emits only context lines when texts are identical', () => {
  const oldText = ['# Changelog', '', '## [v1.0.0]', '- init'].join('\n');
  const newText = oldText;

  const diff = diffChangelog(oldText, newText);
  const lines = diff.split('\n');

  // Headers exist
  expect(lines[0]).toBe('--- a/CHANGELOG.md');
  expect(lines[1]).toBe('+++ b/CHANGELOG.md');
  // No +/- lines when identical (ignore header lines)
  const bodyLines = lines.slice(2);
  expect(bodyLines.some((l) => l.startsWith('+') || l.startsWith('-'))).toBe(
    false,
  );
  // Context lines match input
  expect(diff.includes(' # Changelog')).toBe(true);
  expect(diff.includes(' ## [v1.0.0]')).toBe(true);
  expect(diff.includes(' - init')).toBe(true);
});

test('shows insertion with + and keeps context around it', () => {
  const oldText = ['a', 'b'].join('\n');
  const newText = ['a', 'x', 'b'].join('\n');

  const diff = diffChangelog(oldText, newText);
  const plusLines = diff.split('\n').filter((l) => l.startsWith('+'));

  expect(plusLines).toContain('+x');
  expect(diff.includes(' a')).toBe(true);
  expect(diff.includes(' b')).toBe(true);
});

test('shows deletion with - and keeps context around it', () => {
  const oldText = ['a', 'x', 'b'].join('\n');
  const newText = ['a', 'b'].join('\n');

  const diff = diffChangelog(oldText, newText);
  const minusLines = diff.split('\n').filter((l) => l.startsWith('-'));

  expect(minusLines).toContain('-x');
  expect(diff.includes(' a')).toBe(true);
  expect(diff.includes(' b')).toBe(true);
});

test('line change renders as -old and +new', () => {
  const oldText = ['a', 'x', 'b'].join('\n');
  const newText = ['a', 'y', 'b'].join('\n');

  const diff = diffChangelog(oldText, newText);
  expect(diff.includes('-x')).toBe(true);
  expect(diff.includes('+y')).toBe(true);
});
