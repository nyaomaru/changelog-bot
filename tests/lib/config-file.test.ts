import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from '@jest/globals';
import { loadCliConfigFile } from '@/lib/config-file.js';
import { ConfigError } from '@/lib/errors.js';

describe('loadCliConfigFile', () => {
  test('returns empty config when default file is missing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      expect(loadCliConfigFile(undefined, cwd)).toEqual({});
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('throws when explicit config file is missing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      expect(() => loadCliConfigFile('missing.json', cwd)).toThrow(ConfigError);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('rejects unknown config keys', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      writeFileSync(
        join(cwd, 'changelog-bot.config.json'),
        JSON.stringify({ unknownOption: true }),
        'utf8',
      );

      expect(() => loadCliConfigFile(undefined, cwd)).toThrow(ConfigError);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
