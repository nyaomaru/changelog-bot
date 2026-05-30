import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from '@jest/globals';
import { resolveCustomInstructions } from '@/lib/customization.js';

describe('resolveCustomInstructions', () => {
  test('combines inline and file instructions', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      writeFileSync(
        join(repoPath, 'instructions.md'),
        'Group dependency updates under Chore.\n',
        'utf8',
      );

      expect(
        resolveCustomInstructions({
          instructions: 'Write in Japanese.',
          instructionsFile: 'instructions.md',
          repoPath,
        }),
      ).toBe('Write in Japanese.\n\nGroup dependency updates under Chore.');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  test('returns undefined when no instructions are provided', () => {
    expect(resolveCustomInstructions({ repoPath: '.' })).toBeUndefined();
  });
});
