// @ts-nocheck
import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { loadAppConfig } from '@/lib/app-config.js';
import { getRepoFullName } from '@/utils/repository.js';

describe('utils/repository.getRepoFullName', () => {
  const originalExit = process.exit;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exit = jest.fn() as never;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    process.exit = originalExit;
  });

  test('returns REPO_FULL_NAME when set', () => {
    const config = loadAppConfig({ REPO_FULL_NAME: 'owner/repo' });

    const name = getRepoFullName(config);

    expect(name).toBe('owner/repo');
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('falls back to GITHUB_REPOSITORY when REPO_FULL_NAME is missing', () => {
    const config = loadAppConfig({ GITHUB_REPOSITORY: 'acme/tools' });

    const name = getRepoFullName(config);

    expect(name).toBe('acme/tools');
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('exits when neither env is set or invalid', () => {
    getRepoFullName(loadAppConfig({}));

    expect(errorSpy).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('exits when value does not include a slash', () => {
    getRepoFullName(loadAppConfig({ REPO_FULL_NAME: 'invalid' }));

    expect(errorSpy).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
