// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { tuneCategoryAssignmentsByTitle } from '@/utils/category-tune.js';

describe('category-tune with scoring thresholds', () => {
  test('moves improvement-heavy titles from Chore to Changed', () => {
    const items = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note', index: 0 },
        title: 'add pre-processing to improve classification',
        rawTitle: undefined,
      },
    ];
    const assignments = { 'release-note:0': 'Chore' as const };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Changed');
  });

  test('does not demote explicit Fixed', () => {
    const items = [
      {
        id: 'release-note:0',
        origin: { kind: 'release-note' as const, index: 0 },
        title: 'fix: prevent crash',
        rawTitle: 'fix: prevent crash',
      },
    ];
    const assignments = { 'release-note:0': 'Fixed' as const };
    const out = tuneCategoryAssignmentsByTitle(items, assignments);
    expect(out['release-note:0']).toBe('Fixed');
  });
});
