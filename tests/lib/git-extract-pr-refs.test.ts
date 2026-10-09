// @ts-nocheck
import { test, expect } from '@jest/globals';
import { EXIT_DATA } from '@/constants/errors.js';
import { GitError, mapErrorToExitCode } from '@/lib/errors.js';
import {
  commitsInRange,
  findPullRequestNumberByHeadSha,
  firstCommit,
} from '@/lib/git.js';

test('matches a remote branch head to a GitHub pull ref', () => {
  const output = [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/pull/137/head',
    'dc475bc234d283e98cb1b46609c576d2f3430cb2\trefs/pull/138/head',
  ].join('\n');

  expect(
    findPullRequestNumberByHeadSha(
      output,
      'dc475bc234d283e98cb1b46609c576d2f3430cb2',
    ),
  ).toBe(138);
});

test('maps unsafe git refs to repository data exit code', () => {
  expect(() => commitsInRange('bad/ref', 'HEAD', '.')).toThrow(GitError);

  try {
    commitsInRange('bad/ref', 'HEAD', '.');
  } catch (error) {
    expect(error).toBeInstanceOf(GitError);
    expect(mapErrorToExitCode(error)).toBe(EXIT_DATA);
  }
});

test('maps git command failures to repository data exit code', () => {
  try {
    firstCommit('/definitely/missing/changelog-bot-repo');
    throw new Error('Expected firstCommit to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(GitError);
    expect(mapErrorToExitCode(error)).toBe(EXIT_DATA);
  }
});
