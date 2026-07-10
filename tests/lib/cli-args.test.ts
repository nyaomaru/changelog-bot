// @ts-nocheck
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from '@jest/globals';

import { parseCliArgs } from '@/lib/cli-args.js';
import { EXIT_USAGE } from '@/constants/errors.js';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
} from '@/constants/git.js';
import {
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
  PROVIDER_OPENAI,
} from '@/constants/provider.js';
import {
  DEFAULT_WHY_CONFIDENCE,
  DEFAULT_WHY_LABEL,
  DEFAULT_WHY_MAX_CHARS_PER_PR,
  DEFAULT_WHY_MAX_PRS,
} from '@/constants/why.js';
import { ConfigError, mapErrorToExitCode } from '@/lib/errors.js';

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
    expect(out.dryRunJsonReport).toBe(false);
    expect(out.failOnLlmError).toBe(false);
    expect(out.requireProvider).toBe(false);
    expect(out.noAi).toBe(false);
    expect(out.why).toBe(false);
    expect(out.whyMaxPrs).toBe(DEFAULT_WHY_MAX_PRS);
    expect(out.whyMaxCharsPerPr).toBe(DEFAULT_WHY_MAX_CHARS_PER_PR);
    expect(out.whyConfidence).toBe(DEFAULT_WHY_CONFIDENCE);
    expect(out.whyLabel).toBe(DEFAULT_WHY_LABEL);
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
      '--dry-run-json-report',
      '--fail-on-llm-error',
      '--require-provider',
      '--ai',
      '--why',
      '--why-max-prs',
      '12',
      '--why-max-chars-per-pr',
      '600',
      '--why-confidence',
      'high',
      '--why-label',
      'Reason',
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
    expect(out.dryRunJsonReport).toBe(true);
    expect(out.failOnLlmError).toBe(true);
    expect(out.requireProvider).toBe(true);
    expect(out.noAi).toBe(false);
    expect(out.why).toBe(true);
    expect(out.whyMaxPrs).toBe(12);
    expect(out.whyMaxCharsPerPr).toBe(600);
    expect(out.whyConfidence).toBe('high');
    expect(out.whyLabel).toBe('Reason');
  });

  test('parses --no-ai as deterministic mode', async () => {
    const out = await parseCliArgs(['node', 'cli', '--no-ai']);

    expect(out.noAi).toBe(true);
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
          dryRunJsonReport: true,
          noAi: true,
          why: true,
          whyLabel: 'Reason',
        }),
        'utf8',
      );

      const out = await parseCliArgs(['node', 'cli'], { cwd });

      expect(out.provider).toBe(PROVIDER_GEMINI);
      expect(out.language).toBe('nl');
      expect(out.instructionsFile).toBe('.github/changelog-instructions.md');
      expect(out.dryRunJsonReport).toBe(true);
      expect(out.noAi).toBe(true);
      expect(out.why).toBe(true);
      expect(out.whyLabel).toBe('Reason');
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
          noAi: true,
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
          '--ai',
        ],
        { cwd },
      );

      expect(out.provider).toBe(PROVIDER_ANTHROPIC);
      expect(out.language).toBe('en');
      expect(out.dryRun).toBe(false);
      expect(out.noAi).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('rejects contradictory no-ai and require-provider flags', async () => {
    await expect(
      parseCliArgs(['node', 'cli', '--no-ai', '--require-provider']),
    ).rejects.toThrow('--no-ai cannot be combined with --require-provider');

    await expect(
      parseCliArgs(['node', 'cli', '--no-ai', '--require-provider']),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  test('maps schema-invalid CLI values to usage exit code', async () => {
    try {
      await parseCliArgs(['node', 'cli', '--why-max-prs', '-1']);
      throw new Error('Expected parseCliArgs to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(mapErrorToExitCode(error)).toBe(EXIT_USAGE);
    }
  });

  test.each([
    ['unknown flag', ['node', 'cli', '--unknown-flag']],
    ['invalid provider choice', ['node', 'cli', '--provider', 'bogus']],
  ])('maps yargs %s failures to usage exit code', async (_, argv) => {
    try {
      await parseCliArgs(argv);
      throw new Error('Expected parseCliArgs to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(mapErrorToExitCode(error)).toBe(EXIT_USAGE);
    }
  });
});
