// @ts-nocheck
import { describe, expect, test } from '@jest/globals';

import { parseCliArgs } from '@/lib/cli-args.js';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
} from '@/constants/git.js';
import { PROVIDER_ANTHROPIC, PROVIDER_OPENAI } from '@/constants/provider.js';

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
      '--dry-run',
    ]);

    expect(out.repoPath).toBe('/tmp/repo');
    expect(out.changelogPath).toBe('docs/CHANGELOG.md');
    expect(out.baseBranch).toBe('main');
    expect(out.provider).toBe(PROVIDER_ANTHROPIC);
    expect(out.releaseTag).toBe('v1.2.3');
    expect(out.releaseName).toBe('1.2.3');
    expect(out.releaseBody).toBe('notes');
    expect(out.dryRun).toBe(true);
  });
});
