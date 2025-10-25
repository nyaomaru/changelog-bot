// @ts-nocheck
import { test, expect } from '@jest/globals';
import { insertSection } from '@/lib/changelog.js';

test('inserts after Unreleased with # Changelog header', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n';
  const newSection = '## [v0.1.0]\n- foo';

  const result = insertSection(changelog, '# Changelog', newSection);

  expect(result).toBe(
    '# Changelog\n\n## [Unreleased]\n\n## [v0.1.0]\n- foo\n\n'
  );
});

test('inserts after Unreleased without header', () => {
  const changelog = '## [Unreleased]\n';
  const newSection = '## [v0.1.0]\n- foo';

  const result = insertSection(changelog, '# Changelog', newSection);

  expect(result).toBe('## [Unreleased]\n\n## [v0.1.0]\n- foo\n\n');
});

test('inserts before existing version when header present', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n\n## [v0.1.0]\n- bar\n';
  const newSection = '## [v0.2.0]\n- foo';

  const result = insertSection(changelog, '# Changelog', newSection);

  expect(result).toBe(
    '# Changelog\n\n## [Unreleased]\n\n## [v0.2.0]\n- foo\n\n## [v0.1.0]\n- bar\n'
  );
});
