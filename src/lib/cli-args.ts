import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { CliOptionsSchema, type CliOptions } from '@/schema/cli.js';
import { PROVIDER_NAMES, PROVIDER_OPENAI } from '@/constants/provider.js';
import type { ProviderName } from '@/types/llm.js';
import { loadCliConfigFile } from '@/lib/config-file.js';

type ParseCliArgsOptions = {
  /** Directory used to resolve config files. */
  cwd?: string;
};

function omitUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;
}

/**
 * Parse CLI arguments and normalize them with schema validation.
 * @param argv Raw argv array (typically `process.argv`).
 * @param options Optional parser dependencies for tests.
 * @returns Validated CLI options.
 */
export async function parseCliArgs(
  argv: string[],
  options: ParseCliArgsOptions = {},
): Promise<CliOptions> {
  const parsed = await yargs(hideBin(argv))
    // Force English help/messages regardless of system locale
    .locale('en')
    .option('config', { type: 'string' })
    .option('repo-path', { type: 'string' })
    .option('changelog-path', { type: 'string' })
    .option('base-branch', { type: 'string' })
    .option('provider', {
      type: 'string',
      choices: [...PROVIDER_NAMES] as unknown as readonly string[],
    })
    .option('release-tag', { type: 'string' })
    .option('release-name', { type: 'string' })
    .option('release-body', { type: 'string' })
    .option('language', { type: 'string' })
    .option('instructions', { type: 'string' })
    .option('instructions-file', { type: 'string' })
    .option('dry-run', { type: 'boolean' })
    .option('dry-run-json-report', { type: 'boolean' })
    .option('fail-on-llm-error', { type: 'boolean' })
    .option('require-provider', { type: 'boolean' })
    .option('ai', { type: 'boolean' })
    .strict()
    .parse();

  const config = loadCliConfigFile(parsed.config, options.cwd);
  const cliOverrides = omitUndefined({
    repoPath: parsed['repo-path'],
    changelogPath: parsed['changelog-path'],
    baseBranch: parsed['base-branch'],
    provider: parsed.provider as ProviderName | undefined,
    releaseTag: parsed['release-tag'],
    releaseName: parsed['release-name'],
    releaseBody: parsed['release-body'],
    language: parsed.language,
    instructions: parsed.instructions,
    instructionsFile: parsed['instructions-file'],
    dryRun: parsed['dry-run'],
    dryRunJsonReport: parsed['dry-run-json-report'],
    failOnLlmError: parsed['fail-on-llm-error'],
    requireProvider: parsed['require-provider'],
    noAi: parsed.ai === undefined ? undefined : !parsed.ai,
  });

  return CliOptionsSchema.parse({
    provider: PROVIDER_OPENAI,
    ...config,
    ...cliOverrides,
  });
}
