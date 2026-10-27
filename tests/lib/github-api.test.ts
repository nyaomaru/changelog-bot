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
  mapCommitsToPrs,
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
});
