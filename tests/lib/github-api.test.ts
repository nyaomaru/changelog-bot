const {
  describe,
  test,
  expect,
  jest: jestGlobal,
  beforeEach,
} = await import('@jest/globals');

type JestEnvironment = typeof jestGlobal;
type GetJsonMockFn = (
  url: string,
  headers: Record<string, string>,
  errorPrefix: string,
) => Promise<unknown>;
type GetJsonMock = ReturnType<typeof jestGlobal.fn<GetJsonMockFn>>;

type UnstableMockModule = (
  ...args: Parameters<typeof jestGlobal.mock>
) => ReturnType<typeof jestGlobal.mock>;
const unstableMockModule = (
  jestGlobal as JestEnvironment & {
    unstable_mockModule: UnstableMockModule;
  }
).unstable_mockModule;

// Mock the HTTP util before importing the module under test
let getJsonMock: GetJsonMock;
await unstableMockModule('@/utils/http.js', () => ({
  getJson: (...args: Parameters<GetJsonMockFn>) => getJsonMock(...args),
}));

const {
  fetchReleaseBody,
  fetchReleaseBodyResult,
  fetchPRInfo,
  fetchPullRequestsForBranch,
  prsForCommit,
  prsForCommitData,
  mapCommitsToPrs,
  mapCommitsToPrsWithDiagnostics,
  fetchPullRequestsForBranchResult,
} = await import('@/lib/github.js');

describe('lib/github API helpers', () => {
  beforeEach(() => {
    getJsonMock = jestGlobal.fn<GetJsonMockFn>();
  });

  test('fetchReleaseBody returns body on valid response', async () => {
    getJsonMock.mockResolvedValue({ body: 'hello' });

    const body = await fetchReleaseBody('o', 'r', 'v1.2.3', 't');

    expect(body).toBe('hello');
    expect(getJsonMock).toHaveBeenCalled();
  });

  test('fetchReleaseBodyResult returns typed result on success and failure', async () => {
    getJsonMock.mockResolvedValueOnce({ body: 'v1 notes' });
    const successResult = await fetchReleaseBodyResult('o', 'r', 'v1.0.0', 't');
    expect(successResult).toEqual({
      status: 'success',
      data: 'v1 notes',
    });

    getJsonMock.mockResolvedValueOnce(null);
    const parseFailure = await fetchReleaseBodyResult('o', 'r', 'v1.0.0', 't');
    expect(parseFailure.status).toBe('invalid-response');

    getJsonMock.mockRejectedValueOnce(new Error('connection timeout'));
    const networkFailure = await fetchReleaseBodyResult(
      'o',
      'r',
      'v1.0.0',
      't',
    );
    expect(networkFailure).toEqual({
      status: 'network-error',
      message: 'Network error: connection timeout',
    });
  });

  test('fetchReleaseBody returns empty string on parse error or exception', async () => {
    // parse error
    getJsonMock.mockResolvedValueOnce(null);
    const a = await fetchReleaseBody('o', 'r', 'v0', 't');

    expect(a).toBe('');

    // exception
    getJsonMock.mockRejectedValueOnce(new Error('boom'));
    const b = await fetchReleaseBody('o', 'r', 'v0', 't');

    expect(b).toBe('');
  });

  test('fetchPRInfo returns author and url on valid response, typed failure otherwise', async () => {
    getJsonMock.mockResolvedValueOnce({
      user: { login: 'alice' },
      html_url: 'https://x',
    });
    const ok = await fetchPRInfo('o', 'r', 1, 't');
    expect(ok).toEqual({
      status: 'success',
      data: { author: 'alice', url: 'https://x' },
    });

    getJsonMock.mockResolvedValueOnce(null);
    const bad = await fetchPRInfo('o', 'r', 2, 't');
    expect(bad).toEqual({
      status: 'invalid-response',
      message: expect.stringContaining('Invalid response schema'),
    });
  });

  test('prsForCommit maps PR metadata from response array', async () => {
    getJsonMock.mockResolvedValueOnce([
      {
        number: 10,
        title: 'Add',
        user: { login: 'alice' },
        html_url: 'https://github.com/o/r/pull/10',
      },
      { number: 11 },
    ]);

    const list = await prsForCommit('o', 'r', 'abc', 't');

    expect(list).toEqual([
      {
        number: 10,
        title: 'Add',
        author: 'alice',
        url: 'https://github.com/o/r/pull/10',
      },
      {
        number: 11,
        title: undefined,
        author: undefined,
        url: undefined,
      },
    ]);
  });

  test('fetchPullRequestsForBranch supports anonymous public lookups', async () => {
    getJsonMock.mockResolvedValueOnce([
      {
        number: 138,
        title: 'feat: add opt-in WHY extraction',
        user: { login: 'nyaomaru' },
        html_url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
      },
    ]);

    const pulls = await fetchPullRequestsForBranch(
      'nyaomaru',
      'changelog-bot',
      'feature/why-extraction',
      undefined,
    );

    expect(pulls).toEqual([
      {
        number: 138,
        title: 'feat: add opt-in WHY extraction',
        author: 'nyaomaru',
        url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
      },
    ]);
    expect(getJsonMock.mock.calls[0]?.[0]).toContain(
      'head=nyaomaru%3Afeature%2Fwhy-extraction',
    );
  });

  test('mapCommitsToPrs aggregates per-sha and handles failures', async () => {
    // Return different results based on URL to simulate per-sha behavior
    getJsonMock.mockImplementation((url: string) => {
      if (url.includes('/commits/a1/')) return Promise.resolve([{ number: 1 }]);
      if (url.includes('/commits/b2/'))
        return Promise.reject(new Error('nope'));
      return Promise.resolve([]);
    });

    const map = await mapCommitsToPrs('o', 'r', ['a1', 'b2', 'c3'], 't');

    expect(map.a1).toEqual([{ number: 1 }]);
    expect(map.b2).toEqual([]); // failure -> empty list
    expect(map.c3).toEqual([]);
  });

  test('mapCommitsToPrs bounds concurrent requests to the configured limit', async () => {
    let activeRequests = 0;
    let maxObservedActiveRequests = 0;

    getJsonMock.mockImplementation(async () => {
      activeRequests += 1;
      maxObservedActiveRequests = Math.max(
        maxObservedActiveRequests,
        activeRequests,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;
      return [];
    });

    const commitShas = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    const concurrencyLimit = 2;
    await mapCommitsToPrs(
      'o',
      'r',
      commitShas,
      't',
      undefined,
      concurrencyLimit,
    );

    expect(maxObservedActiveRequests).toBe(concurrencyLimit);
    expect(activeRequests).toBe(0);
    expect(getJsonMock).toHaveBeenCalledTimes(commitShas.length);
  });
  test('prsForCommitData returns typed success and classified failure outcomes', async () => {
    getJsonMock.mockResolvedValueOnce([
      {
        number: 42,
        title: 'Fix bug',
        user: { login: 'octo' },
        html_url: 'https://github.com/o/r/pull/42',
      },
    ]);

    const successResult = await prsForCommitData('o', 'r', 'sha-1', 'token');
    expect(successResult).toEqual({
      status: 'success',
      data: [
        {
          number: 42,
          title: 'Fix bug',
          author: 'octo',
          url: 'https://github.com/o/r/pull/42',
        },
      ],
    });

    getJsonMock.mockRejectedValueOnce(
      new Error('GitHub API rate limit exceeded (status: 403)'),
    );
    const rateLimitResult = await prsForCommitData('o', 'r', 'sha-2', 'token');
    expect(rateLimitResult.status).toBe('rate-limited');

    getJsonMock.mockResolvedValueOnce('not-an-array');
    const invalidResult = await prsForCommitData('o', 'r', 'sha-3', 'token');
    expect(invalidResult.status).toBe('invalid-response');
  });

  test('mapCommitsToPrsWithDiagnostics aggregates diagnostics across commits', async () => {
    getJsonMock.mockImplementation((url: string) => {
      if (url.includes('/commits/c-success/')) {
        return Promise.resolve([{ number: 10 }]);
      }
      if (url.includes('/commits/c-ratelimit/')) {
        return Promise.reject(new Error('API rate limit exceeded'));
      }
      return Promise.reject(new Error('Network offline'));
    });

    const result = await mapCommitsToPrsWithDiagnostics(
      'o',
      'r',
      ['c-success', 'c-ratelimit', 'c-offline'],
      'token',
    );

    expect(result.pullRequestsBySha['c-success']).toEqual([{ number: 10 }]);
    expect(result.pullRequestsBySha['c-ratelimit']).toEqual([]);
    expect(result.pullRequestsBySha['c-offline']).toEqual([]);

    expect(result.diagnostics.totalLookups).toBe(3);
    expect(result.diagnostics.successfulLookups).toBe(1);
    expect(result.diagnostics.degradedLookups).toBe(2);
    expect(result.diagnostics.failureCounts['rate-limited']).toBe(1);
    expect(result.diagnostics.failureCounts['network-error']).toBe(1);
    expect(result.diagnostics.fallbackReasons.length).toBe(2);
  });

  test('fetchPullRequestsForBranchResult returns typed results', async () => {
    getJsonMock.mockResolvedValueOnce([
      {
        number: 99,
        title: 'Feature',
        user: { login: 'dev' },
        html_url: 'https://github.com/o/r/pull/99',
      },
    ]);

    const result = await fetchPullRequestsForBranchResult(
      'o',
      'r',
      'feat-branch',
      'token',
    );
    expect(result).toEqual({
      status: 'success',
      data: [
        {
          number: 99,
          title: 'Feature',
          author: 'dev',
          url: 'https://github.com/o/r/pull/99',
        },
      ],
    });

    getJsonMock.mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { status: 404 }),
    );
    const notFoundResult = await fetchPullRequestsForBranchResult(
      'o',
      'r',
      'feat-branch',
      'token',
    );
    expect(notFoundResult.status).toBe('not-found');
  });
});
