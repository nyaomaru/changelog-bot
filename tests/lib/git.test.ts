import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import {
  commitsFromMerge,
  commitsInRange,
  currentBranch,
  dateForRef,
  firstCommit,
  gitMergedPRs,
  run,
  tryDetectLatestTag,
  tryDetectPrevTag,
  tryRun,
} from '@/lib/git.js';

function executeGit(repositoryPath: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
  }).trim();
}

describe('git repository helpers', () => {
  let repositoryPath: string;
  let initialCommitSha: string;
  let featureCommitSha: string;
  let mergeCommitSha: string;

  beforeAll(() => {
    repositoryPath = mkdtempSync(join(tmpdir(), 'changelog-bot-git-'));
    executeGit(repositoryPath, ['init', '--initial-branch=main']);
    executeGit(repositoryPath, ['config', 'user.name', 'Changelog Bot Test']);
    executeGit(repositoryPath, [
      'config',
      'user.email',
      'changelog-bot@example.com',
    ]);

    writeFileSync(join(repositoryPath, 'README.md'), 'initial\n', 'utf8');
    executeGit(repositoryPath, ['add', 'README.md']);
    executeGit(repositoryPath, ['commit', '-m', 'chore: initial commit']);
    initialCommitSha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);
    executeGit(repositoryPath, ['tag', 'v1.0.0']);

    executeGit(repositoryPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(repositoryPath, 'feature.txt'), 'feature\n', 'utf8');
    executeGit(repositoryPath, ['add', 'feature.txt']);
    executeGit(repositoryPath, ['commit', '-m', 'feat: add feature']);
    featureCommitSha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    executeGit(repositoryPath, ['checkout', 'main']);
    writeFileSync(join(repositoryPath, 'main.txt'), 'main\n', 'utf8');
    executeGit(repositoryPath, ['add', 'main.txt']);
    executeGit(repositoryPath, ['commit', '-m', 'docs: update main']);
    executeGit(repositoryPath, [
      'merge',
      '--no-ff',
      'feature',
      '-m',
      'Merge pull request #42 from feature',
      '-m',
      'Add the release feature.',
    ]);
    mergeCommitSha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);
    executeGit(repositoryPath, ['tag', 'v1.1.0']);
  });

  afterAll(() => {
    rmSync(repositoryPath, { recursive: true, force: true });
  });

  test('reads branch, tag, commit, and date metadata', () => {
    expect(run(['branch', '--show-current'], repositoryPath)).toBe('main');
    expect(currentBranch(repositoryPath)).toBe('main');
    expect(tryDetectLatestTag(repositoryPath)).toBe('v1.1.0');
    expect(tryDetectPrevTag('v1.1.0', repositoryPath)).toBe('v1.0.0');
    expect(firstCommit(repositoryPath)).toBe(initialCommitSha);
    expect(dateForRef('v1.1.0', repositoryPath)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('enumerates commit ranges and merge contents', () => {
    const commits = commitsInRange('v1.0.0', 'v1.1.0', repositoryPath);

    expect(commits).toEqual(
      expect.arrayContaining([
        { sha: featureCommitSha, subject: 'feat: add feature' },
        {
          sha: mergeCommitSha,
          subject: 'Merge pull request #42 from feature',
        },
      ]),
    );
    expect(gitMergedPRs('v1.0.0', 'v1.1.0', repositoryPath)).toContain(
      `${mergeCommitSha} Add the release feature.`,
    );
    expect(commitsFromMerge(mergeCommitSha, repositoryPath)).toContain(
      featureCommitSha,
    );
  });

  test('returns null for failed optional Git lookups', () => {
    expect(tryRun(['not-a-command'], repositoryPath)).toBeNull();
  });

  test('returns null when HEAD is detached', () => {
    executeGit(repositoryPath, ['checkout', '--detach', mergeCommitSha]);

    try {
      expect(currentBranch(repositoryPath)).toBeNull();
    } finally {
      executeGit(repositoryPath, ['checkout', 'main']);
    }
  });
});
