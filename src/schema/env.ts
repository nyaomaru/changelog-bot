import { z } from 'zod';

/**
 * Environment variable validation used by the CLI.
 * Note: Tokens are optional at parse-time; requiredness is enforced by flow (e.g., PR creation).
 */
export const EnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1).optional(),
  // GitHub App credentials (optional; used when PAT is absent)
  GITHUB_APP_ID: z.string().min(1).optional(),
  /**
   * GitHub App private key in PEM format. Supports either literal multiline
   * PEM or a single-line value with \n sequences.
   */
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  /** Optional installation id; autodetected from repo when omitted. */
  GITHUB_APP_INSTALLATION_ID: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  REPO_FULL_NAME: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Enforce presence of GITHUB_TOKEN when creating a PR (non-dry-run).
 */
export function ensureGithubTokenRequired(
  dryRun: boolean,
  token?: string
): void {
  if (dryRun) return;
  if (!token) throw new Error('GITHUB_TOKEN is required to create PR.');
}
