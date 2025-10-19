// @ts-nocheck
import { test, expect } from '@jest/globals';
import {
  insertSection,
  hasSection,
  replaceSection,
  removeAllSections,
  hasDuplicateVersion,
} from '@/lib/changelog.js';

function applySection(
  existing: string,
  version: string,
  anchor: string,
  section: string
): string {
  if (hasDuplicateVersion(existing, version)) {
    existing = removeAllSections(existing, version);
  }
  if (hasSection(existing, version)) {
    return replaceSection(existing, version, section);
  }
  return insertSection(existing, anchor, section);
}

test('re-running keeps a single section per version', () => {
  const version = '1.2.3';
  const anchor = '## [Unreleased]';

  const first = applySection(
    `${anchor}\n\n`,
    version,
    anchor,
    `## [v${version}] - 2024-01-01\n- foo`
  );
  const second = applySection(
    first,
    version,
    anchor,
    `## [v${version}] - 2024-01-01\n- bar`
  );
  const regExp = new RegExp(`^##\\s*\\[v${version}\\]`, 'gm');
  const count = (second.match(regExp) || []).length;

  expect(count).toBe(1);
  expect(second.includes('- bar')).toBe(true);
});

test('removes pre-existing duplicate sections', () => {
  const version = '2.0.0';
  const anchor = '## [Unreleased]';
  const section = `## [v${version}] - 2024-01-01\n- baz`;
  const duplicated = `${anchor}\n\n${section}\n\n${section}\n`;

  const result = applySection(duplicated, version, anchor, section);
  const regExp = new RegExp(`^##\\s*\\[v${version}\\]`, 'gm');
  const count = (result.match(regExp) || []).length;

  expect(count).toBe(1);
});
