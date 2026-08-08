import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { readChangelog, writeChangelog } from '@/lib/changelog-file.js';

describe('changelog file operations', () => {
  test('reads existing UTF-8 changelog content', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    const changelogPath = join(directory, 'CHANGELOG.md');

    try {
      writeFileSync(changelogPath, '# Changelog\n\n日本語の変更履歴\n', 'utf8');

      expect(readChangelog(changelogPath)).toBe(
        '# Changelog\n\n日本語の変更履歴\n',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('returns an empty string when the changelog does not exist', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changelog-bot-'));

    try {
      expect(readChangelog(join(directory, 'missing.md'))).toBe('');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('writes UTF-8 content and overwrites an existing changelog', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    const changelogPath = join(directory, 'CHANGELOG.md');

    try {
      writeFileSync(changelogPath, 'old content', 'utf8');

      writeChangelog(changelogPath, '# Changelog\n\n- Added a feature\n');

      expect(readFileSync(changelogPath, 'utf8')).toBe(
        '# Changelog\n\n- Added a feature\n',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
