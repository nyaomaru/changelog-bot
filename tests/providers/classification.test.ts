import { describe, expect, jest, test } from '@jest/globals';

import {
  classifyChangesWithFallback,
  parseCategoryAssignments,
} from '@/providers/classification.js';

const changes = [{ id: 'release-note:0' as const, title: 'Fix lookup' }];

describe('classifyChangesWithFallback', () => {
  test('returns an empty map without requesting classification for empty input', async () => {
    const request = jest.fn<() => Promise<string>>();

    const result = await classifyChangesWithFallback({
      changes: [],
      hasApiKey: true,
      request,
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({ assignments: {}, diagnostics: [] });
    expect(request).not.toHaveBeenCalled();
  });

  test('uses the deterministic fallback without a provider key', async () => {
    const request = jest.fn<() => Promise<string>>();

    const result = await classifyChangesWithFallback({
      changes,
      hasApiKey: false,
      request,
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({
      assignments: { 'release-note:0': 'Fixed' },
      diagnostics: [],
    });
    expect(request).not.toHaveBeenCalled();
  });

  test('parses a valid provider response', async () => {
    const result = await classifyChangesWithFallback({
      changes,
      hasApiKey: true,
      request: async () => JSON.stringify({ 'release-note:0': 'Fixed' }),
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({
      assignments: { 'release-note:0': 'Fixed' },
      diagnostics: [],
    });
  });

  test('applies hard source rules to a provider assignment', async () => {
    const result = await classifyChangesWithFallback({
      changes: [
        {
          id: 'release-note:0',
          title: 'feat(core)!: replace output',
        },
      ],
      hasApiKey: true,
      request: async () => JSON.stringify({ 'release-note:0': 'Added' }),
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({
      assignments: { 'release-note:0': 'Breaking Changes' },
      diagnostics: [],
    });
  });

  test('falls back when the provider request fails', async () => {
    const result = await classifyChangesWithFallback({
      changes,
      hasApiKey: true,
      request: async () => {
        throw new Error('Provider unavailable');
      },
      invalidResponseMessage: 'Invalid response',
    });

    expect(result).toEqual({
      assignments: { 'release-note:0': 'Fixed' },
      diagnostics: [
        'Invalid response; used deterministic fallback for all changes',
      ],
    });
  });

  test('propagates invalid provider responses when requested', async () => {
    await expect(
      classifyChangesWithFallback({
        changes,
        hasApiKey: true,
        options: { throwOnError: true },
        request: async () => JSON.stringify({ 'release-note:0': ['Fixed'] }),
        invalidResponseMessage: 'Invalid provider response',
      }),
    ).rejects.toThrow('Invalid provider response');
  });

  test('fills missing IDs and records a reconciliation diagnostic', () => {
    const result = parseCategoryAssignments(
      JSON.stringify({ 'release-note:0': 'Fixed' }),
      [...changes, { id: 'release-note:1', title: 'Add diagnostics' }],
    );

    expect(result).toEqual({
      assignments: {
        'release-note:0': 'Fixed',
        'release-note:1': 'Added',
      },
      diagnostics: [
        'Classification response omitted 1 change ID(s): release-note:1; used deterministic fallback',
      ],
    });
  });

  test('rejects omitted assignments when strict mode is enabled', async () => {
    await expect(
      classifyChangesWithFallback({
        changes: [
          ...changes,
          { id: 'release-note:1', title: 'Add diagnostics' },
        ],
        hasApiKey: true,
        options: { throwOnError: true },
        request: async () => JSON.stringify({ 'release-note:0': 'Fixed' }),
        invalidResponseMessage: 'Invalid provider response',
      }),
    ).rejects.toThrow(
      'Invalid provider response: Classification response omitted 1 change ID(s): release-note:1',
    );
  });

  test('rejects duplicate input IDs before reconciliation', () => {
    expect(
      parseCategoryAssignments(JSON.stringify({ 'release-note:0': 'Fixed' }), [
        ...changes,
        { id: 'release-note:0', title: 'Duplicate identity' },
      ]),
    ).toBeUndefined();
  });

  test.each([
    {
      caseName: 'an unknown category',
      assignments: { 'release-note:0': 'Unknown' },
    },
    {
      caseName: 'an unknown ID',
      assignments: {
        'release-note:0': 'Fixed',
        'release-note:99': 'Added',
      },
    },
  ])('rejects assignments containing $caseName', ({ assignments }) => {
    expect(
      parseCategoryAssignments(JSON.stringify(assignments), changes),
    ).toBeUndefined();
  });
});
