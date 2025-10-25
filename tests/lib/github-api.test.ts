// @ts-nocheck
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
  errorPrefix: string
) => Promise<unknown>;

type UnstableMockModule = (
  ...args: Parameters<typeof jestGlobal.mock>
) => ReturnType<typeof jestGlobal.mock>;
const unstableMockModule = (
  jestGlobal as JestEnvironment & {
    unstable_mockModule: UnstableMockModule;
  }
).unstable_mockModule;

// Mock the HTTP util before importing the module under test
let getJsonMock: jest.MockedFunction<GetJsonMockFn>;
await unstableMockModule('@/utils/http.js', () => ({
  getJson: (...args: Parameters<GetJsonMockFn>) => getJsonMock(...args),
}));

const { fetchReleaseBody, fetchPRInfo, prsForCommit, mapCommitsToPrs } =
  await import('@/lib/github.js');

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

  test('fetchPRInfo returns author and url on valid response, null otherwise', async () => {
    getJsonMock.mockResolvedValueOnce({
      user: { login: 'alice' },
      html_url: 'https://x',
    });
    const ok = await fetchPRInfo('o', 'r', 1, 't');
    expect(ok).toEqual({ author: 'alice', url: 'https://x' });

    getJsonMock.mockResolvedValueOnce(null);
    const bad = await fetchPRInfo('o', 'r', 2, 't');
    expect(bad).toBeNull();
  });

  test('prsForCommit maps number/title from response array', async () => {
    getJsonMock.mockResolvedValueOnce([
      { number: 10, title: 'Add' },
      { number: 11 },
    ]);

    const list = await prsForCommit('o', 'r', 'abc', 't');

    expect(list).toEqual([{ number: 10, title: 'Add' }, { number: 11 }]);
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
