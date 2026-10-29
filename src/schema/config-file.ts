import { z } from 'zod';
import { PROVIDER_NAMES } from '@/constants/provider.js';

/**
 * Runtime validation for optional JSON config files.
 * WHY: Config files are a public surface, so reject unknown keys early instead
 * of silently ignoring typos. `$schema` is whitelisted explicitly so editors can
 * attach the published JSON schema without tripping strict validation.
 * The `.describe()` texts double as hover docs in the generated JSON schema.
 */
export const CliConfigFileSchema = z
  .object({
    $schema: z
      .string()
      .optional()
      .describe('URI or path of the JSON schema used for editor validation.'),
    repoPath: z.string().optional().describe('Path to repository root.'),
    changelogPath: z.string().optional().describe('Path to CHANGELOG file.'),
    baseBranch: z.string().optional().describe('Base branch for the PR.'),
    provider: z.enum(PROVIDER_NAMES).optional().describe('LLM provider.'),
    releaseTag: z
      .string()
      .optional()
      .describe('Git ref (tag or HEAD) to generate the release for.'),
    releaseName: z
      .string()
      .optional()
      .describe('Display name for the version (without `v`).'),
    releaseBody: z
      .string()
      .optional()
      .describe('Additional release notes body.'),
    language: z
      .string()
      .min(1)
      .optional()
      .describe('Language for generated changelog prose.'),
    instructions: z
      .string()
      .optional()
      .describe('Additional changelog writing/grouping instructions.'),
    instructionsFile: z
      .string()
      .optional()
      .describe('Path to a file with additional instructions.'),
    dryRun: z
      .boolean()
      .optional()
      .describe('Print the updated CHANGELOG to stdout instead of writing it.'),
    dryRunJsonReport: z
      .boolean()
      .optional()
      .describe('Print dry-run provider diagnostics as JSON.'),
    failOnLlmError: z
      .boolean()
      .optional()
      .describe('Fail instead of falling back when provider calls fail.'),
    requireProvider: z
      .boolean()
      .optional()
      .describe('Fail when the selected provider API key is missing.'),
    noAi: z
      .boolean()
      .optional()
      .describe('Skip all provider calls and use deterministic output.'),
    why: z
      .boolean()
      .optional()
      .describe('Extract short WHY notes from PR descriptions.'),
    whyEngine: z
      .enum(['llm', 'jev'])
      .optional()
      .describe('WHY engine (`jev` is experimental).'),
    whyMaxPrs: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Maximum PRs to inspect for WHY extraction.'),
    whyMaxCharsPerPr: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum candidate characters sent per PR.'),
    whyConfidence: z
      .enum(['low', 'medium', 'high'])
      .optional()
      .describe('Minimum WHY confidence.'),
    whyLabel: z
      .string()
      .min(1)
      .optional()
      .describe('Label rendered before WHY notes.'),
  })
  .strict();

export type CliConfigFile = z.infer<typeof CliConfigFileSchema>;