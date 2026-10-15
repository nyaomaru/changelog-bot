import { describe, expect, test } from '@jest/globals';
import {
  validateReleaseResult,
  ReleaseValidationError,
} from '@/utils/release-validation.js';
import type {
  ExcludedReleaseChange,
  ReleaseChange,
  ReleaseResult,
} from '@/types/release.js';

describe('validateReleaseResult', () => {
  const change1: ReleaseChange = {
    id: 'pr:101',
    origin: { kind: 'pull-request', number: 101 },
    title: 'first change',
  };

  const change2: ReleaseChange = {
    id: 'commit:abcdef',
    origin: { kind: 'commit', sha: 'abcdef' },
    title: 'second change',
  };

  const excluded1: ExcludedReleaseChange = {
    change: {
      id: 'commit:111111',
      origin: { kind: 'commit', sha: '111111' },
      title: 'collapsed commit',
    },
    reason: 'collapsed-into-pr',
    detail: 'Collapsed into PR #101',
  };

  const excluded2: ExcludedReleaseChange = {
    change: {
      id: 'commit:222222',
      origin: { kind: 'commit', sha: '222222' },
      title: 'duplicate change',
    },
    reason: 'duplicate',
    detail: 'Duplicate PR entry',
  };

  const excluded3: ExcludedReleaseChange = {
    change: {
      id: 'release-note:0',
      origin: { kind: 'release-note', index: 0 },
      title: 'filtered out internal note',
    },
    reason: 'filtered',
  };

  test('returns kind: "release" when changes are present and valid', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1, change2],
      assignments: { 'pr:101': 'Added', 'commit:abcdef': 'Fixed' },
      excludedChanges: [excluded1],
    };

    const outcome = validateReleaseResult(result, [
      change1,
      change2,
      excluded1.change,
    ]);

    expect(outcome.kind).toBe('release');
    if (outcome.kind === 'release') {
      expect(outcome.result).toBe(result);
      expect(outcome.result.changes).toHaveLength(2);
      expect(outcome.result.excludedChanges).toHaveLength(1);
    }
  });

  test('returns kind: "no-changes" when changes list is empty', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [],
      assignments: {},
      excludedChanges: [excluded1, excluded2, excluded3],
    };

    const outcome = validateReleaseResult(result);

    expect(outcome.kind).toBe('no-changes');
    if (outcome.kind === 'no-changes') {
      expect(outcome.version).toBe('1.0.0');
      expect(outcome.date).toBe('2026-10-14');
      expect(outcome.excludedChanges).toEqual([
        excluded1,
        excluded2,
        excluded3,
      ]);
    }
  });

  test('throws ReleaseValidationError on duplicate change IDs in changes', () => {
    const duplicateChange: ReleaseChange = {
      ...change1,
      title: 'another title for pr:101',
    };

    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1, duplicateChange],
      assignments: { 'pr:101': 'Added' },
      excludedChanges: [],
    };

    expect(() => validateReleaseResult(result)).toThrow(ReleaseValidationError);
    expect(() => validateReleaseResult(result)).toThrow(
      'Duplicate change ID in changes: pr:101',
    );
  });

  test('throws ReleaseValidationError when an ID appears in both changes and excludedChanges', () => {
    const overlappingExcluded: ExcludedReleaseChange = {
      change: change1,
      reason: 'duplicate',
    };

    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1],
      assignments: { 'pr:101': 'Added' },
      excludedChanges: [overlappingExcluded],
    };

    expect(() => validateReleaseResult(result)).toThrow(ReleaseValidationError);
    expect(() => validateReleaseResult(result)).toThrow(
      "Change ID 'pr:101' appears in both changes and excludedChanges",
    );
  });

  test('throws ReleaseValidationError on duplicate change IDs in excludedChanges', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1],
      assignments: { 'pr:101': 'Added' },
      excludedChanges: [excluded1, excluded1],
    };

    expect(() => validateReleaseResult(result)).toThrow(ReleaseValidationError);
    expect(() => validateReleaseResult(result)).toThrow(
      `Duplicate change ID in excludedChanges: ${excluded1.change.id}`,
    );
  });

  test('throws ReleaseValidationError when source change is missing from result without exclusion reason', () => {
    const missingChange: ReleaseChange = {
      id: 'commit:missing',
      origin: { kind: 'commit', sha: 'missing' },
      title: 'vanished change',
    };

    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1],
      assignments: { 'pr:101': 'Added' },
      excludedChanges: [],
    };

    expect(() =>
      validateReleaseResult(result, [change1, missingChange]),
    ).toThrow(ReleaseValidationError);
    expect(() =>
      validateReleaseResult(result, [change1, missingChange]),
    ).toThrow(
      "Source change 'commit:missing' missing from release result without an exclusion reason",
    );
  });

  test('returns kind: "release" when changes are empty but additional sections exist', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [],
      assignments: {},
      excludedChanges: [],
      sections: [{ heading: "What's New", body: 'Release highlights.' }],
    };

    const outcome = validateReleaseResult(result);

    expect(outcome.kind).toBe('release');
    if (outcome.kind === 'release') {
      expect(outcome.result.sections).toHaveLength(1);
    }
  });

  test('throws ReleaseValidationError when a change is missing a category assignment', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1],
      assignments: {},
      excludedChanges: [],
    };

    expect(() => validateReleaseResult(result)).toThrow(ReleaseValidationError);
    expect(() => validateReleaseResult(result)).toThrow(
      "Missing or invalid category assignment for change 'pr:101'",
    );
  });

  test('throws ReleaseValidationError when an assignment has a category not in SECTION_ORDER', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1],
      assignments: {
        'pr:101':
          'NonExistentCategory' as unknown as import('@/types/changelog.js').BucketName,
      },
      excludedChanges: [],
    };

    expect(() => validateReleaseResult(result)).toThrow(ReleaseValidationError);
    expect(() => validateReleaseResult(result)).toThrow(
      "Missing or invalid category assignment for change 'pr:101': NonExistentCategory",
    );
  });

  test('throws ReleaseValidationError when assignments contain an unknown change ID', () => {
    const result: ReleaseResult = {
      version: '1.0.0',
      date: '2026-10-14',
      changes: [change1],
      assignments: {
        'pr:101': 'Added',
        'pr:999': 'Fixed',
      },
      excludedChanges: [],
    };

    expect(() => validateReleaseResult(result)).toThrow(ReleaseValidationError);
    expect(() => validateReleaseResult(result)).toThrow(
      "Assignment found for unknown change ID 'pr:999'",
    );
  });
});
