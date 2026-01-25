// WHY: This test focuses on behavior via fetch mocking; we avoid strict types for mocked shapes.

// Mock crypto signing so we don't need a real PEM
// WHY: ESM-style Jest puts helpers under '@jest/globals'; typings for this subpath can be
// finicky with NodeNext + ts-jest. Import with a targeted suppression to keep the test focused.

// @ts-ignore -- runtime module exists; types are covered by "types: ['jest']" in tsconfig.tests.json
import { jest } from '@jest/globals';
// @ts-ignore: ESM mocking API is available at runtime; typings for unstable_mockModule are missing in @types/jest.
jest.unstable_mockModule('node:crypto', () => ({
  createSign: () => ({
    update: () => undefined,
    sign: () => Buffer.from('sig'),
  }),
}));

// Import after mocks
const { resolveGitHubAuth } = await import('@/utils/github-auth.js');

type FetchOptions = {
  headers?: Record<string, string>;
} & Record<string, unknown>;

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as FetchMock;
}

describe('github-auth utils', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    // reset env per test
    process.env = { ...originalEnv };
    // default: undefined token/app vars
    delete process.env.GITHUB_TOKEN;
    delete process.env.CHANGELOG_BOT_APP_ID;
    delete process.env.CHANGELOG_BOT_APP_PRIVATE_KEY;
    delete process.env.CHANGELOG_BOT_APP_INSTALLATION_ID;
    delete process.env.GITHUB_API_BASE;
  });

  afterEach(() => {
    global.fetch = originalFetch as unknown as typeof fetch;
    process.env = originalEnv;
  });

  test('returns PAT when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';

    const auth = await resolveGitHubAuth('acme', 'repo');
    expect(auth).toEqual({ token: 'ghp_test', source: 'pat' });
  });

  test('exchanges App credentials for installation token (auto-detect install)', async () => {
    process.env.CHANGELOG_BOT_APP_ID = '12345';
    // Provide a private key with \n escapes; normalization should handle it
    process.env.CHANGELOG_BOT_APP_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';

    const calls: Array<{ url: string; options: FetchOptions }> = [];
    // Mock fetch for: GET /repos/{owner}/{repo}/installation then POST /app/installations/{id}/access_tokens
    const fetchMock = createFetchMock().mockImplementation(
      async (url, options) => {
        const fetchOptions = (options ?? {}) as FetchOptions;
        calls.push({ url: String(url), options: fetchOptions });
        if (String(url).includes('/repos/acme/repo/installation')) {
          return {
            ok: true,
            text: async () => JSON.stringify({ id: 999 }),
          } as Response;
        }
        if (String(url).includes('/app/installations/999/access_tokens')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                token: 'ghs_install_token',
                expires_at: '2030-01-01T00:00:00Z',
              }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          text: async () => 'not found',
        } as Response;
      },
    ) as FetchMock;
    global.fetch = fetchMock;

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
    process.env.CHANGELOG_BOT_APP_ID = '12345';
    process.env.CHANGELOG_BOT_APP_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';
    process.env.CHANGELOG_BOT_APP_INSTALLATION_ID = '777';

    let requestCount = 0;
    const fetchMock = createFetchMock().mockImplementation(async (url) => {
      requestCount += 1;
      if (String(url).includes('/app/installations/777/access_tokens')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              token: 'ghs_token_777',
              expires_at: '2029-12-31T00:00:00Z',
            }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        text: async () => 'not found',
      } as Response;
    }) as FetchMock;
    global.fetch = fetchMock;

    const auth = await resolveGitHubAuth('acme', 'repo');
    expect(auth?.source).toBe('app');
    expect(auth?.token).toBe('ghs_token_777');
    // Only one request (no installation detection)
    expect(requestCount).toBe(1);
  });
});
