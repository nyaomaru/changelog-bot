import { describe, expect, test } from '@jest/globals';
import { reconcileEditorialOutput } from '@/utils/editorial.js';
import type { ReleaseDraft } from '@/types/release.js';

describe('editorial reconciliation', () => {
  const sampleDraft: ReleaseDraft = {
    version: '1.0.0',
    date: '2026-10-03',
    changes: [
      {
        id: 'pr:10',
        origin: { kind: 'pull-request', number: 10 },
        title: 'add export flag',
        rawTitle: 'feat: add export flag',
      },
      {
        id: 'pr:20',
        origin: { kind: 'pull-request', number: 20 },
        title: 'drop deprecated legacy API',
        rawTitle: 'feat!: drop deprecated legacy API',
      },
      {
        id: 'commit:abc1234',
        origin: { kind: 'commit', sha: 'abc1234' },
        title: 'internal project configuration',
        rawTitle: 'internal project configuration',
      },
    ],
    assignments: {
      'pr:10': 'Added',
      'pr:20': 'Breaking Changes',
      'commit:abc1234': 'Changed',
    },
  };

  test('returns draft unchanged when editorial output is undefined', () => {
    const { result, diagnostics } = reconcileEditorialOutput(sampleDraft);
    expect(diagnostics).toHaveLength(0);
    expect(result.changes[0].title).toBe('add export flag');
    expect(result.assignments['pr:10']).toBe('Added');
  });

  test('applies sparse title and category adjustments', () => {
    const { result, prTitle, prBody, diagnostics } = reconcileEditorialOutput(
      sampleDraft,
      {
        changes: {
          'pr:10': {
            title: 'Add `--export` CLI flag for automated workflows',
          },
          'commit:abc1234': {
            category: 'Chore',
          },
        },
        pr_title: 'release: 1.0.0',
        pr_body: 'Automated release summary',
      },
    );

    expect(diagnostics).toHaveLength(0);
    expect(result.changes[0].title).toBe(
      'Add `--export` CLI flag for automated workflows',
    );
    expect(result.assignments['commit:abc1234']).toBe('Chore');
    expect(prTitle).toBe('release: 1.0.0');
    expect(prBody).toBe('Automated release summary');
  });

  test('rejects unknown IDs with diagnostics and ignores them', () => {
    const { result, diagnostics } = reconcileEditorialOutput(sampleDraft, {
      changes: {
        'pr:999': { title: 'hallucinated change' },
      },
    });

    expect(diagnostics).toEqual([
      'Editorial output contained 1 unknown ID(s): pr:999; rejected',
    ]);
    expect(result.changes).toHaveLength(3);
    expect(result.assignments['pr:999']).toBeUndefined();
  });

  test('deterministic classification precedence prevents overriding breaking changes', () => {
    const { result } = reconcileEditorialOutput(sampleDraft, {
      changes: {
        'pr:20': {
          category: 'Docs', // model tries to downgrade a breaking change
        },
      },
    });

    // Hard rule: feat!: remains Breaking Changes
    expect(result.assignments['pr:20']).toBe('Breaking Changes');
  });
});
