// @ts-nocheck
import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { getRepoFullName } from '@/utils/repository.js';

describe('utils/repository.getRepoFullName', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exit = jest.fn() as never;
  });

  afterEach(() => {
    process.env = originalEnv;
    errorSpy.mockRestore();
    process.exit = originalExit;
  });

  test('returns REPO_FULL_NAME when set', () => {
    process.env.REPO_FULL_NAME = 'owner/repo';
    delete process.env.GITHUB_REPOSITORY;

    const name = getRepoFullName();

    expect(name).toBe('owner/repo');
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('falls back to GITHUB_REPOSITORY when REPO_FULL_NAME is missing', () => {
    delete process.env.REPO_FULL_NAME;
    process.env.GITHUB_REPOSITORY = 'acme/tools';

    const name = getRepoFullName();

    expect(name).toBe('acme/tools');
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('exits when neither env is set or invalid', () => {
    delete process.env.REPO_FULL_NAME;
    delete process.env.GITHUB_REPOSITORY;

    getRepoFullName();

    expect(errorSpy).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('exits when value does not include a slash', () => {
    process.env.REPO_FULL_NAME = 'invalid';
    delete process.env.GITHUB_REPOSITORY;

    getRepoFullName();

    expect(errorSpy).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
