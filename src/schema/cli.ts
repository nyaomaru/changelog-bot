import { z } from 'zod';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
} from '@/constants/git.js';
import { PROVIDER_ANTHROPIC, PROVIDER_OPENAI } from '@/constants/provider.js';

/**
 * Runtime validation for CLI options after yargs parsing.
 * WHY: Ensures consistent shapes and supported values across the app.
 */
export const CliOptionsSchema = z.object({
  repoPath: z.string().default('.'),
  changelogPath: z.string().default(DEFAULT_CHANGELOG_FILE),
  baseBranch: z.string().default(DEFAULT_BASE_BRANCH),
  provider: z.enum([PROVIDER_OPENAI, PROVIDER_ANTHROPIC]),
  releaseTag: z.string().optional(),
  releaseName: z.string().optional(),
  releaseBody: z.string().default(''),
  dryRun: z.boolean().default(false),
});

export type CliOptions = z.infer<typeof CliOptionsSchema>;
