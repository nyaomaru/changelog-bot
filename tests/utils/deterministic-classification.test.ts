import { describe, expect, test } from '@jest/globals';
import type { CategoryAssignments } from '@/types/changelog.js';
import type { ReleaseChange } from '@/types/release.js';
import {
  applyDeterministicClassification,
  classifyChangesDeterministically,
  classifyTitleDeterministically,
} from '@/utils/deterministic-classification.js';

function releaseNoteChange(
  index: number,
  title: string,
  rawTitle?: string,
): ReleaseChange {
  return {
    id: `release-note:${index}`,
    origin: { kind: 'release-note', index },
    title,
    rawTitle,
  };
}

describe('deterministic classification', () => {
  test.each([
    'feat!: replace the output contract',
    'feat(core)!: replace the output contract',
    'fix!: remove legacy parsing',
    'fix(api)!: remove legacy parsing',
  ])('prioritizes the breaking marker in %s', (title) => {
    expect(classifyTitleDeterministically(title)).toEqual({
      category: 'Breaking Changes',
      signal: 'breaking',
    });
  });

  test.each([
    ['feat: add export support', 'Added'],
    ['fix(parser): prevent a crash', 'Fixed'],
    ['refactor: simplify parsing', 'Changed'],
    ['perf: reduce allocations', 'Changed'],
    ['style: format generated output', 'Changed'],
    ['docs: update the guide', 'Docs'],
    ['test: cover duplicate titles', 'Test'],
    ['build: update packaging', 'Chore'],
    ['ci: update the release workflow', 'Chore'],
    ['chore: update dependencies', 'Chore'],
    ['revert: restore legacy output', 'Reverted'],
  ])('maps conventional title %s to %s', (title, category) => {
    expect(classifyTitleDeterministically(title)).toEqual({
      category,
      signal: 'conventional',
    });
  });

  test('keeps a conventional type above conflicting semantic intent', () => {
    expect(
      classifyTitleDeterministically('chore: tighten option type'),
    ).toEqual({
      category: 'Chore',
      signal: 'conventional',
    });
  });

  test.each([
    ['tighten option type to prevent misuse', 'Fixed'],
    ['improve classification consistency', 'Changed'],
    ['Update dependency prettier to v3.8.0', 'Chore'],
  ])('applies strong semantic classification for %s', (title, category) => {
    expect(classifyTitleDeterministically(title)).toEqual({
      category,
      signal: 'strong-semantic',
    });
  });

  test('uses weak score signals before the Chore fallback', () => {
    expect(classifyTitleDeterministically('patch parser handling')).toEqual({
      category: 'Fixed',
      signal: 'weak-semantic',
    });
    expect(classifyTitleDeterministically('miscellaneous work')).toEqual({
      category: 'Chore',
      signal: 'fallback',
    });
  });

  test('produces complete no-provider assignments', () => {
    expect(
      classifyChangesDeterministically([
        { id: 'release-note:0', title: 'feat!: replace output' },
        { id: 'release-note:1', title: 'fix: prevent crash' },
      ]),
    ).toEqual({
      'release-note:0': 'Breaking Changes',
      'release-note:1': 'Fixed',
    });
  });

  test('overrides provider output with higher-precedence source signals', () => {
    const changes = [
      releaseNoteChange(0, 'Replace output', 'feat(core)!: replace output'),
      releaseNoteChange(1, 'Prevent crash', 'fix: prevent crash'),
      releaseNoteChange(2, 'Tighten option type'),
    ];
    const providerAssignments: CategoryAssignments = {
      'release-note:0': 'Added',
      'release-note:1': 'Added',
      'release-note:2': 'Added',
    };

    expect(
      applyDeterministicClassification(changes, providerAssignments),
    ).toEqual({
      'release-note:0': 'Breaking Changes',
      'release-note:1': 'Fixed',
      'release-note:2': 'Fixed',
    });
  });

  test('uses weak semantics only to replace weak provider categories', () => {
    const changes = [
      releaseNoteChange(0, 'patch parser handling'),
      releaseNoteChange(1, 'patch renderer handling'),
    ];

    expect(
      applyDeterministicClassification(changes, {
        'release-note:0': 'Added',
        'release-note:1': 'Chore',
      }),
    ).toEqual({
      'release-note:0': 'Added',
      'release-note:1': 'Fixed',
    });
  });
});
