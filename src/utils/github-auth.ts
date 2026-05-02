import { createSign } from 'node:crypto';
import {
  GitHubAccessTokenSchema,
  GitHubInstallationSchema,
} from '@/schema/github.js';
import {
  GITHUB_ACCEPT,
  GITHUB_API_VERSION,
  GITHUB_APP_JWT_ALG,
  GITHUB_APP_JWT_SKEW_SECONDS,
  GITHUB_APP_JWT_TTL_SECONDS,
  GITHUB_APP_SIGN_ALG,
} from '@/constants/github.js';
import { getJson, postJson } from '@/utils/http.js';
import type { GitHubRuntimeConfig } from '@/types/config.js';
import type { GitHubAuth } from '@/types/github.js';
import { base64url } from '@/utils/base64url.js';
import { MS_PER_SECOND } from '@/constants/time.js';

/**
 * Normalize private key: allow either multiline PEM or single-line with \n.
 */
function normalizePrivateKey(raw: string): string {
  // Normalize common encodings: escaped \n and CRLF -> LF
  const normalizedPrivateKey = raw.includes('\\n')
    ? raw.replaceAll('\\n', '\n')
    : raw;
  return normalizedPrivateKey.replace(/\r/g, '');
}

/**
 * Create a short-lived JWT for GitHub App authentication.
 * @param appId GitHub App ID (numeric or string).
 * @param privateKey PEM private key.
 */
function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / MS_PER_SECOND);

  // WHY: Keep token lifetime short (10m) per GitHub guidance.
  const payload = {
    iat: now - GITHUB_APP_JWT_SKEW_SECONDS,
    exp: now + GITHUB_APP_JWT_TTL_SECONDS,
    iss: appId,
  } as const;
  const header = { alg: GITHUB_APP_JWT_ALG, typ: 'JWT' } as const;
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const signer = createSign(GITHUB_APP_SIGN_ALG);
  signer.update(data);
  let signature: Buffer;

  try {
    signature = signer.sign(privateKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Provide actionable hints for common PEM decoding issues.
    throw new Error(
      `Failed to sign GitHub App JWT with provided private key: ${msg}. ` +
        'Check that GITHUB_APP_PRIVATE_KEY contains a valid PEM (BEGIN PRIVATE KEY / BEGIN RSA PRIVATE KEY), ' +
        'newlines are preserved (use literal PEM or \\n escapes), and the key is unencrypted.',
      { cause: err },
    );
  }
  return `${data}.${base64url(signature)}`;
}

/**
 * Standard GitHub headers for REST calls.
 */
function ghHeaders(auth?: string): Record<string, string> {
  const header: Record<string, string> = {
    Accept: GITHUB_ACCEPT,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (auth) header.Authorization = `Bearer ${auth}`;
  return header;
}

/**
 * Resolve a GitHub token for the repo, preferring PAT, then GitHub App.
 * - If GITHUB_TOKEN is set, returns it.
 * - Else, if GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY present, exchanges for an installation token.
 * @param owner Org/user name.
 * @param repo Repository name.
 * @param config GitHub runtime configuration for the current invocation.
 */
export async function resolveGitHubAuth(
  owner: string,
  repo: string,
  config: GitHubRuntimeConfig,
): Promise<GitHubAuth | undefined> {
  const pat = config.token;
  if (pat) return { token: pat, source: 'pat' };

  // Use CI-safe aliases only (no GITHUB_ prefix for Secrets compatibility)
  const appId = config.appId;
  const privateKeyRaw = config.appPrivateKey;
  if (!appId || !privateKeyRaw) return undefined;

  const privateKey = normalizePrivateKey(String(privateKeyRaw));
  const jwt = createAppJwt(String(appId), privateKey);

  // Determine installation id: env or via repo lookup
  let installationId = config.appInstallationId;
  if (!installationId) {
    const instUrl = `${config.apiBase}/repos/${owner}/${repo}/installation`;
    const inst = await getJson<unknown>(instUrl, ghHeaders(jwt), 'GitHub API');
    const parsed = GitHubInstallationSchema.safeParse(inst);
    if (!parsed.success) {
      throw new Error(
        `Failed to detect GitHub App installation for ${owner}/${repo}. Ensure the GitHub App is installed on this repository and has the required permissions.`,
      );
    }
    installationId = String(parsed.data.id);
  }

  // Exchange for installation access token
  const tokenUrl = `${config.apiBase}/app/installations/${installationId}/access_tokens`;
  const tokenRes = await postJson<unknown>(
    tokenUrl,
    {},
    ghHeaders(jwt),
    'GitHub API',
  );
  const parsedToken = GitHubAccessTokenSchema.safeParse(tokenRes);
  if (!parsedToken.success) {
    throw new Error(
      `Failed to create installation access token for installation ${installationId}. Verify the GitHub App has the required permissions and the installation is active.`,
    );
  }

  return {
    token: parsedToken.data.token,
    source: 'app',
    expiresAt: parsedToken.data.expires_at,
  };
}
