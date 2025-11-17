// @ts-nocheck
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

// Mock crypto signing so we don't need a real PEM
jest.unstable_mockModule('node:crypto', () => ({
  createSign: () => ({
    update: () => undefined,
    sign: () => Buffer.from('sig'),
  }),
}));

// Import after mocks
const { resolveGitHubAuth } = await import('@/utils/github-auth.js');

describe('github-auth utils', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    // reset env per test
    process.env = { ...originalEnv };
    // default: undefined token/app vars
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_API_BASE;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = originalFetch as any;
    process.env = originalEnv;
  });

  test('returns PAT when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';

    const auth = await resolveGitHubAuth('acme', 'repo');
    expect(auth).toEqual({ token: 'ghp_test', source: 'pat' });
  });

  test('exchanges App credentials for installation token (auto-detect install)', async () => {
    process.env.GITHUB_APP_ID = '12345';
    // Provide a private key with \n escapes; normalization should handle it
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';

    const calls: Array<{ url: string; options: any }> = [];
    // Mock fetch for: GET /repos/{owner}/{repo}/installation then POST /app/installations/{id}/access_tokens
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: string, options: any) => {
        calls.push({ url, options });
        if (String(url).includes('/repos/acme/repo/installation')) {
          return { ok: true, text: async () => JSON.stringify({ id: 999 }) };
        }
        if (String(url).includes('/app/installations/999/access_tokens')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                token: 'ghs_install_token',
                expires_at: '2030-01-01T00:00:00Z',
              }),
          };
        }
        return { ok: false, status: 404, text: async () => 'not found' };
      });

    const auth = await resolveGitHubAuth('acme', 'repo');
    expect(auth?.source).toBe('app');
    expect(auth?.token).toBe('ghs_install_token');
    expect(auth?.expiresAt).toBe('2030-01-01T00:00:00Z');

    // Two calls: detect installation then exchange token
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain('/repos/acme/repo/installation');
    expect(calls[1].url).toContain('/app/installations/999/access_tokens');
    // Authorization header must be present (JWT); we don't assert value
    expect(calls[0].options?.headers?.Authorization).toMatch(/^Bearer\s+/);
    expect(calls[1].options?.headers?.Authorization).toMatch(/^Bearer\s+/);
  });

  test('uses provided installation id and skips detection', async () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';
    process.env.GITHUB_APP_INSTALLATION_ID = '777';

    let requestCount = 0;
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      requestCount += 1;
      if (String(url).includes('/app/installations/777/access_tokens')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              token: 'ghs_token_777',
              expires_at: '2029-12-31T00:00:00Z',
            }),
        };
      }
      return { ok: false, status: 404, text: async () => 'not found' };
    });

    const auth = await resolveGitHubAuth('acme', 'repo');
    expect(auth?.source).toBe('app');
    expect(auth?.token).toBe('ghs_token_777');
    // Only one request (no installation detection)
    expect(requestCount).toBe(1);
  });
});
