// eslint-disable @typescript-eslint/no-explicit-any -- Tests may coerce types when focusing on behavior, not type surfaces.
import { tuneCategoryAssignmentsByTitle } from '@/utils/category-tune.js';
import type { ReleaseChange } from '@/types/release.js';
import type { CategoryAssignments } from '@/types/changelog.js';

describe('tuneCategoryAssignmentsByTitle', () => {
  test('moves conventional fix-like titles to Fixed', () => {
    const items: ReleaseChange[] = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note', index: 0 },
        title: 'tighten option type',
        rawTitle: 'chore: tighten option type',
      },
    ];
    const assignments: CategoryAssignments = { 'release-note:0': 'Chore' };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Fixed');
  });

  test('moves refactor-like titles to Changed', () => {
    const items: ReleaseChange[] = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note', index: 0 },
        title: 'refactor: internal pipeline',
        rawTitle: 'refactor: internal pipeline',
      },
    ];
    const assignments: CategoryAssignments = { 'release-note:0': 'Chore' };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Changed');
  });

  test('moves feat: titles to Added', () => {
    const items: ReleaseChange[] = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note', index: 0 },
        title: 'Support GitHub App auth',
        rawTitle: 'feat: Support GitHub App auth',
      },
    ];
    const assignments: CategoryAssignments = { 'release-note:0': 'Chore' };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Added');
  });

  test('matches feat(scope)!: and fix(scope)!: forms', () => {
    const items: ReleaseChange[] = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note', index: 0 },
        title: 'Breaking feature',
        rawTitle: 'feat(core)!: new something',
      },
      {
        id: 'release-note:1',
        origin: { kind: 'release-note', index: 1 },
        title: 'Critical fix',
        rawTitle: 'fix(api)!: patch issue',
      },
    ];
    const assignments: CategoryAssignments = {
      'release-note:0': 'Chore',
      'release-note:1': 'Chore',
    };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Added');
    expect(out['release-note:1']).toBe('Fixed');
  });

  test('keeps dependency-only updates in Chore', () => {
    const items: ReleaseChange[] = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note', index: 0 },
        title: 'Update dependency prettier to v3.8.0',
        rawTitle: 'chore(deps): Update dependency prettier to v3.8.0',
      },
    ];
    const assignments: CategoryAssignments = { 'release-note:0': 'Changed' };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Chore');
  });
});
