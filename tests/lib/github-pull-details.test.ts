const {
  beforeEach,
  describe,
  expect,
  jest: jestGlobal,
  test,
} = await import('@jest/globals');

type GetJsonMock = (
  url: string,
  headers: Record<string, string>,
  errorPrefix: string,
) => Promise<unknown>;

type JestEnvironment = typeof jestGlobal;
type UnstableMockModule = (
  ...args: Parameters<typeof jestGlobal.mock>
) => ReturnType<typeof jestGlobal.mock>;
const unstableMockModule = (
  jestGlobal as JestEnvironment & { unstable_mockModule: UnstableMockModule }
).unstable_mockModule;

let getJsonMock: jest.MockedFunction<GetJsonMock>;
await unstableMockModule('@/utils/http.js', () => ({
  getJson: (...args: Parameters<GetJsonMock>) => getJsonMock(...args),
}));

const { fetchPRDetails, fetchPRInfo } = await import('@/lib/github.js');

describe('GitHub pull request details', () => {
  beforeEach(() => {
    getJsonMock = jestGlobal.fn<GetJsonMock>();
  });

  test('normalizes full and minimal views from the shared PR response', async () => {
    getJsonMock.mockResolvedValue({
      number: 42,
      title: 'feat: split GitHub API responsibilities',
      body: null,
      user: { login: 'nyaomaru' },
      html_url: 'https://github.com/nyaomaru/changelog-bot/pull/42',
    });

    await expect(
      fetchPRDetails('nyaomaru', 'changelog-bot', 42),
    ).resolves.toEqual({
      number: 42,
      title: 'feat: split GitHub API responsibilities',
      body: '',
      author: 'nyaomaru',
      url: 'https://github.com/nyaomaru/changelog-bot/pull/42',
    });
    await expect(fetchPRInfo('nyaomaru', 'changelog-bot', 42)).resolves.toEqual(
      {
        author: 'nyaomaru',
        url: 'https://github.com/nyaomaru/changelog-bot/pull/42',
      },
    );
  });

  test('returns null when the shared PR response is invalid or unavailable', async () => {
    getJsonMock.mockResolvedValueOnce({ number: 'invalid' });
    getJsonMock.mockRejectedValueOnce(new Error('unavailable'));

    await expect(fetchPRDetails('o', 'r', 1)).resolves.toBeNull();
    await expect(fetchPRInfo('o', 'r', 1)).resolves.toBeNull();
  });
});
