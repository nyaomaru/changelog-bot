// @ts-nocheck
const {
  describe,
  test,
  expect,
  jest: jestGlobal,
  beforeEach,
} = await import('@jest/globals');

type ExecFileSyncFunction = typeof import('node:child_process').execFileSync;
type JestEnvironment = typeof jestGlobal;

// Mocks
const execFileSyncMock = jestGlobal.fn();
type UnstableMockModule = (
  ...args: Parameters<typeof jestGlobal.mock>
) => ReturnType<typeof jestGlobal.mock>;
const unstableMockModule = (
  jestGlobal as JestEnvironment & {
    unstable_mockModule: UnstableMockModule;
  }
).unstable_mockModule;

await unstableMockModule('node:child_process', () => ({
  execFileSync: (...args: Parameters<ExecFileSyncFunction>) =>
    execFileSyncMock(...args),
}));

const pullsCreate = jestGlobal.fn(async () => ({ data: { number: 42 } }));
const addLabels = jestGlobal.fn(async () => ({}));
await unstableMockModule('octokit', () => ({
  Octokit: class OctokitMock {
    rest = {
      pulls: { create: pullsCreate },
      issues: { addLabels },
    };
    constructor() {}
  },
}));

const { createPR } = await import('@/lib/pr.js');

describe('lib/pr.createPR', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    pullsCreate.mockClear();
    addLabels.mockClear();
  });

  test('creates a PR with expected git commands and labels', async () => {
    const prNum = await createPR({
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
      branchName: 'chore/changelog-v1.0.0',
      title: 'docs(changelog): v1.0.0',
      body: 'body',
      labels: ['changelog'],
      token: 'token',
      changelogEntry: 'CHANGELOG.md',
    });

    expect(execFileSyncMock).toHaveBeenCalledTimes(4);
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      'git',
      ['checkout', '-b', 'chore/changelog-v1.0.0'],
      { stdio: 'inherit' },
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      'git',
      ['add', 'CHANGELOG.md'],
      { stdio: 'inherit' },
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      3,
      'git',
      ['commit', '-m', 'docs(changelog): v1.0.0'],
      { stdio: 'inherit' },
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      4,
      'git',
      ['push', 'origin', 'chore/changelog-v1.0.0'],
      { stdio: 'inherit' },
    );
    expect(pullsCreate).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      base: 'main',
      head: 'chore/changelog-v1.0.0',
      title: 'docs(changelog): v1.0.0',
      body: 'body',
    });
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      issue_number: 42,
      labels: ['changelog'],
    });

    expect(prNum).toBe(42);
  });

  test('skips labels when none provided', async () => {
    await createPR({
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
      branchName: 'feat/x',
      title: 'title',
      body: '',
      labels: [],
      token: 't',
      changelogEntry: 'CHANGELOG.md',
    });

    expect(addLabels).not.toHaveBeenCalled();
  });

  test('passes titles and changelog paths without shell escaping', async () => {
    await createPR({
      owner: 'o',
      repo: 'r',
      baseBranch: 'main',
      branchName: 'feat/release notes',
      title: 'docs(changelog): "quoted" title',
      body: '',
      labels: [],
      token: 't',
      changelogEntry: 'docs/Release Notes.md',
    });

    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      'git',
      ['add', 'docs/Release Notes.md'],
      { stdio: 'inherit' },
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      3,
      'git',
      ['commit', '-m', 'docs(changelog): "quoted" title'],
      { stdio: 'inherit' },
    );
  });
});
