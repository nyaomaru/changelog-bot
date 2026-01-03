import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { CliOptionsSchema, type CliOptions } from '@/schema/cli.js';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
} from '@/constants/git.js';
import { PROVIDER_NAMES, PROVIDER_OPENAI } from '@/constants/provider.js';
import type { ProviderName } from '@/types/llm.js';

/**
 * Parse CLI arguments and normalize them with schema validation.
 * @param argv Raw argv array (typically `process.argv`).
 * @returns Validated CLI options.
 */
export async function parseCliArgs(argv: string[]): Promise<CliOptions> {
  const parsed = await yargs(hideBin(argv))
    // Force English help/messages regardless of system locale
    .locale('en')
    .option('repo-path', { type: 'string', default: '.' })
    .option('changelog-path', {
      type: 'string',
      default: DEFAULT_CHANGELOG_FILE,
    })
    .option('base-branch', { type: 'string', default: DEFAULT_BASE_BRANCH })
    .option('provider', {
      type: 'string',
      choices: [...PROVIDER_NAMES] as unknown as readonly string[],
      default: PROVIDER_OPENAI,
    })
    .option('release-tag', { type: 'string' })
    .option('release-name', { type: 'string' })
    .option('release-body', { type: 'string', default: '' })
    .option('dry-run', { type: 'boolean', default: false })
    .strict()
    .parse();

  return CliOptionsSchema.parse({
    repoPath: parsed['repo-path'],
    changelogPath: parsed['changelog-path'],
    baseBranch: parsed['base-branch'],
    provider: parsed.provider as ProviderName,
    releaseTag: parsed['release-tag'],
    releaseName: parsed['release-name'],
    releaseBody: parsed['release-body'],
    dryRun: parsed['dry-run'],
  });
}
