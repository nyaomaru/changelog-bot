import { z } from 'zod';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_CHANGELOG_FILE,
} from '@/constants/git.js';
import { PROVIDER_NAMES } from '@/constants/provider.js';
import {
  DEFAULT_WHY_CONFIDENCE,
  DEFAULT_WHY_LABEL,
  DEFAULT_WHY_MAX_CHARS_PER_PR,
  DEFAULT_WHY_MAX_PRS,
} from '@/constants/why.js';

/**
 * Runtime validation for CLI options after yargs parsing.
 * WHY: Ensures consistent shapes and supported values across the app.
 */
export const CliOptionsSchema = z
  .object({
    repoPath: z.string().default('.'),
    changelogPath: z.string().default(DEFAULT_CHANGELOG_FILE),
    baseBranch: z.string().default(DEFAULT_BASE_BRANCH),
    provider: z.enum(PROVIDER_NAMES),
    releaseTag: z.string().optional(),
    releaseName: z.string().optional(),
    releaseBody: z.string().default(''),
    language: z.string().min(1).default('en'),
    instructions: z.string().optional(),
    instructionsFile: z.string().optional(),
    dryRun: z.boolean().default(false),
    dryRunJsonReport: z.boolean().default(false),
    failOnLlmError: z.boolean().default(false),
    requireProvider: z.boolean().default(false),
    noAi: z.boolean().default(false),
    why: z.boolean().default(false),
    whyMaxPrs: z.number().int().nonnegative().default(DEFAULT_WHY_MAX_PRS),
    whyMaxCharsPerPr: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_WHY_MAX_CHARS_PER_PR),
    whyConfidence: z
      .enum(['low', 'medium', 'high'])
      .default(DEFAULT_WHY_CONFIDENCE),
    whyLabel: z.string().min(1).default(DEFAULT_WHY_LABEL),
  })
  .superRefine((options, context) => {
    if (options.noAi && options.requireProvider) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noAi'],
        message: '--no-ai cannot be combined with --require-provider',
      });
    }
  });

export type CliOptions = z.infer<typeof CliOptionsSchema>;
