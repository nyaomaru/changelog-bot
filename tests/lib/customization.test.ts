import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from '@jest/globals';
import {
  CUSTOM_INSTRUCTIONS_ENCODING,
  CUSTOM_INSTRUCTIONS_MAX_CHARS,
  resolveCustomInstructions,
  resolveCustomInstructionsWithDiagnostics,
} from '@/lib/customization.js';

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

  test('ignores empty instructions files', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      writeFileSync(join(repoPath, 'instructions.md'), ' \n ', 'utf8');

      const result = resolveCustomInstructionsWithDiagnostics({
        instructionsFile: 'instructions.md',
        repoPath,
      });

      expect(result.instructions).toBeUndefined();
      expect(result.diagnostics).toMatchObject({
        requested: true,
        resolved: false,
        fileStatus: 'empty',
        encoding: CUSTOM_INSTRUCTIONS_ENCODING,
      });
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  test('ignores unreadable instructions files', () => {
    const result = resolveCustomInstructionsWithDiagnostics({
      instructionsFile: 'missing.md',
      repoPath: '.',
    });

    expect(result.instructions).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      requested: true,
      resolved: false,
      fileStatus: 'read_failed',
      filePath: 'missing.md',
    });
    expect(result.diagnostics.fileError).toContain('missing.md');
  });

  test('truncates combined instructions to the documented maximum size', () => {
    const result = resolveCustomInstructionsWithDiagnostics({
      instructions: 'x'.repeat(CUSTOM_INSTRUCTIONS_MAX_CHARS + 1),
      repoPath: '.',
    });

    expect(result.instructions).toHaveLength(CUSTOM_INSTRUCTIONS_MAX_CHARS);
    expect(result.diagnostics.chars).toBe(CUSTOM_INSTRUCTIONS_MAX_CHARS);
    expect(result.diagnostics.truncated).toBe(true);
  });
});
