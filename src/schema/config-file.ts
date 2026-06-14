import { z } from 'zod';
import { PROVIDER_NAMES } from '@/constants/provider.js';

/**
 * Runtime validation for optional JSON config files.
 * WHY: Config files are a public surface, so reject unknown keys early instead
 * of silently ignoring typos.
 */
export const CliConfigFileSchema = z
  .object({
    repoPath: z.string().optional(),
    changelogPath: z.string().optional(),
    baseBranch: z.string().optional(),
    provider: z.enum(PROVIDER_NAMES).optional(),
    releaseTag: z.string().optional(),
    releaseName: z.string().optional(),
    releaseBody: z.string().optional(),
    language: z.string().min(1).optional(),
    instructions: z.string().optional(),
    instructionsFile: z.string().optional(),
    dryRun: z.boolean().optional(),
    dryRunJsonReport: z.boolean().optional(),
    failOnLlmError: z.boolean().optional(),
    requireProvider: z.boolean().optional(),
    noAi: z.boolean().optional(),
    why: z.boolean().optional(),
    whyMaxPrs: z.number().int().nonnegative().optional(),
    whyMaxCharsPerPr: z.number().int().positive().optional(),
    whyConfidence: z.enum(['low', 'medium', 'high']).optional(),
    whyLabel: z.string().min(1).optional(),
  })
  .strict();

export type CliConfigFile = z.infer<typeof CliConfigFileSchema>;
