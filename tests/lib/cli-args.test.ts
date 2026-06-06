// @ts-nocheck
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from '@jest/globals';

import { parseCliArgs } from '@/lib/cli-args.js';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
} from '@/constants/git.js';
import {
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
  PROVIDER_OPENAI,
} from '@/constants/provider.js';

describe('cli-args', () => {
  test('parses defaults with minimal argv', async () => {
    const out = await parseCliArgs(['node', 'cli']);

    expect(out.repoPath).toBe('.');
    expect(out.changelogPath).toBe(DEFAULT_CHANGELOG_FILE);
    expect(out.baseBranch).toBe(DEFAULT_BASE_BRANCH);
    expect(out.provider).toBe(PROVIDER_OPENAI);
    expect(out.releaseTag).toBeUndefined();
    expect(out.releaseName).toBeUndefined();
    expect(out.releaseBody).toBe('');
    expect(out.language).toBe('en');
    expect(out.instructions).toBeUndefined();
    expect(out.instructionsFile).toBeUndefined();
    expect(out.dryRun).toBe(false);
  });

  test('parses explicit flags', async () => {
    const out = await parseCliArgs([
      'node',
      'cli',
      '--repo-path',
      '/tmp/repo',
      '--changelog-path',
      'docs/CHANGELOG.md',
      '--base-branch',
      'main',
      '--provider',
      PROVIDER_ANTHROPIC,
      '--release-tag',
      'v1.2.3',
      '--release-name',
      '1.2.3',
      '--release-body',
      'notes',
      '--language',
      'ja',
      '--instructions',
      'Use concise bullets.',
      '--instructions-file',
      '.github/changelog-instructions.md',
      '--dry-run',
    ]);

    expect(out.repoPath).toBe('/tmp/repo');
    expect(out.changelogPath).toBe('docs/CHANGELOG.md');
    expect(out.baseBranch).toBe('main');
    expect(out.provider).toBe(PROVIDER_ANTHROPIC);
    expect(out.releaseTag).toBe('v1.2.3');
    expect(out.releaseName).toBe('1.2.3');
    expect(out.releaseBody).toBe('notes');
    expect(out.language).toBe('ja');
    expect(out.instructions).toBe('Use concise bullets.');
    expect(out.instructionsFile).toBe('.github/changelog-instructions.md');
    expect(out.dryRun).toBe(true);
  });

  test('parses gemini provider', async () => {
    const out = await parseCliArgs([
      'node',
      'cli',
      '--provider',
      PROVIDER_GEMINI,
    ]);

    expect(out.provider).toBe(PROVIDER_GEMINI);
  });

  test('loads default config file from cwd', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      writeFileSync(
        join(cwd, 'changelog-bot.config.json'),
        JSON.stringify({
          provider: PROVIDER_GEMINI,
          language: 'nl',
          instructionsFile: '.github/changelog-instructions.md',
        }),
        'utf8',
      );

      const out = await parseCliArgs(['node', 'cli'], { cwd });

      expect(out.provider).toBe(PROVIDER_GEMINI);
      expect(out.language).toBe('nl');
      expect(out.instructionsFile).toBe('.github/changelog-instructions.md');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('lets CLI flags override config file values', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changelog-bot-'));
    try {
      const configPath = join(cwd, 'custom-config.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          provider: PROVIDER_GEMINI,
          language: 'nl',
          dryRun: true,
        }),
        'utf8',
      );

      const out = await parseCliArgs(
        [
          'node',
          'cli',
          '--config',
          configPath,
          '--provider',
          PROVIDER_ANTHROPIC,
          '--language',
          'en',
          '--no-dry-run',
        ],
        { cwd },
      );

      expect(out.provider).toBe(PROVIDER_ANTHROPIC);
      expect(out.language).toBe('en');
      expect(out.dryRun).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
