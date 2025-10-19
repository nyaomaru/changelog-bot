// @ts-nocheck
import { test, expect } from '@jest/globals';
import {
  hasSection,
  replaceSection,
  removeAllSections,
  hasDuplicateVersion,
} from '@/lib/changelog.js';

test('hasSection detects presence by version heading', () => {
  const content = `# Changelog\n\n## [Unreleased]\n\n## [v1.0.0]\n- init`;

  expect(hasSection(content, '1.0.0')).toBe(true);
  expect(hasSection(content, '2.0.0')).toBe(false);
});

test('replaceSection swaps only the matching version block', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [v1.0.0]',
    '- old line',
    '',
    '## [v0.9.0]',
    '- keep this',
    '',
  ].join('\n');

  const after = replaceSection(before, '1.0.0', '## [v1.0.0]\n- new line');

  expect(after.includes('## [v1.0.0]\n- new line')).toBe(true);
  expect(after.includes('## [v0.9.0]\n- keep this')).toBe(true);
  expect(after.includes('- old line')).toBe(false);
});

test('removeAllSections deletes duplicates and normalizes spacing', () => {
  const v = '2.0.0';
  const section = `## [v${v}]\n- a`;
  const content = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    section,
    '',
    section,
    '',
    '## [v1.0.0]',
    '- keep',
  ].join('\n');

  const out = removeAllSections(content, v);

  expect(hasDuplicateVersion(out, v)).toBe(false);
  expect(out.includes(section)).toBe(false);
  // Unrelated sections remain
  expect(out.includes('## [v1.0.0]')).toBe(true);
});
