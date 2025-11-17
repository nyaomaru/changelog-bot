import { createSign } from 'node:crypto';
import { EnvSchema } from '@/schema/env.js';
import {
  GitHubAccessTokenSchema,
  GitHubInstallationSchema,
} from '@/schema/github.js';
import {
  GITHUB_ACCEPT,
  GITHUB_API_VERSION,
  GITHUB_API_BASE,
  GITHUB_APP_JWT_ALG,
  GITHUB_APP_JWT_SKEW_SECONDS,
  GITHUB_APP_JWT_TTL_SECONDS,
  GITHUB_APP_SIGN_ALG,
} from '@/constants/github.js';
import { getJson, postJson } from '@/utils/http.js';
import type { GitHubAuth, TokenSource } from '@/types/github.js';

// API base comes from constants (supports GHES override via env)

/**
 * Build a base64url string from input.
 */
function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Normalize private key: allow either multiline PEM or single-line with \n.
 */
function normalizePrivateKey(raw: string): string {
  // Normalize common encodings: escaped \n and CRLF -> LF
  const v = raw.includes('\\n') ? raw.replaceAll('\\n', '\n') : raw;
  return v.replace(/\r/g, '');
}

/**
 * Create a short-lived JWT for GitHub App authentication.
 * @param appId GitHub App ID (numeric or string).
 * @param privateKey PEM private key.
 */
function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Provide actionable hints for common PEM decoding issues.
    throw new Error(
      `Failed to sign GitHub App JWT with provided private key: ${msg}. ` +
        'Check that GITHUB_APP_PRIVATE_KEY contains a valid PEM (BEGIN PRIVATE KEY / BEGIN RSA PRIVATE KEY), ' +
        'newlines are preserved (use literal PEM or \\n escapes), and the key is unencrypted.'
    );
  }
  return `${data}.${base64url(signature)}`;
}

/**
 * Standard GitHub headers for REST calls.
 */
function ghHeaders(auth?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: GITHUB_ACCEPT,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (auth) h.Authorization = `Bearer ${auth}`;
  return h;
}

// Types moved to src/types/github.ts

/**
 * Resolve a GitHub token for the repo, preferring PAT, then GitHub App.
 * - If GITHUB_TOKEN is set, returns it.
 * - Else, if GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY present, exchanges for an installation token.
 * @param owner Org/user name.
 * @param repo Repository name.
 */
export async function resolveGitHubAuth(
  owner: string,
  repo: string
): Promise<GitHubAuth | undefined> {
  const env = EnvSchema.safeParse(process.env);
  const get = (k: keyof typeof process.env) =>
    env.success ? (env.data as any)[k] : process.env[k];

  const pat = get('GITHUB_TOKEN');
  if (pat) return { token: pat as string, source: 'pat' };

  const appId = get('GITHUB_APP_ID');
  const privateKeyRaw = get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !privateKeyRaw) return undefined;

  const privateKey = normalizePrivateKey(String(privateKeyRaw));
  const jwt = createAppJwt(String(appId), privateKey);

  // Determine installation id: env or via repo lookup
  let installationId = get('GITHUB_APP_INSTALLATION_ID');
  if (!installationId) {
    const instUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/installation`;
    const inst = await getJson<unknown>(instUrl, ghHeaders(jwt), 'GitHub API');
    const parsed = GitHubInstallationSchema.safeParse(inst);
    if (!parsed.success) {
      throw new Error('Failed to detect GitHub App installation for repo');
    }
    installationId = String(parsed.data.id);
  }

  // Exchange for installation access token
  const tokenUrl = `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`;
  const tokenRes = await postJson<unknown>(
    tokenUrl,
    {},
    ghHeaders(jwt),
    'GitHub API'
  );
  const parsedToken = GitHubAccessTokenSchema.safeParse(tokenRes);
  if (!parsedToken.success) {
    throw new Error('Failed to create installation access token');
  }
  return {
    token: parsedToken.data.token,
    source: 'app',
    expiresAt: parsedToken.data.expires_at,
  };
}
