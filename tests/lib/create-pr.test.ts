// @ts-nocheck
const {
  describe,
  test,
  expect,
  jest: jestGlobal,
  beforeEach,
} = await import('@jest/globals');

type ExecSyncFunction = typeof import('node:child_process').execSync;
type JestEnvironment = typeof jestGlobal;

// Mocks
const execSyncMock = jestGlobal.fn();
type UnstableMockModule = (
  ...args: Parameters<typeof jestGlobal.mock>
) => ReturnType<typeof jestGlobal.mock>;
const unstableMockModule = (
  jestGlobal as JestEnvironment & {
    unstable_mockModule: UnstableMockModule;
  }
).unstable_mockModule;

await unstableMockModule('node:child_process', () => ({
  execSync: (...args: Parameters<ExecSyncFunction>) => execSyncMock(...args),
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
    execSyncMock.mockReset();
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

    expect(execSyncMock).toHaveBeenCalledTimes(4);
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
});
