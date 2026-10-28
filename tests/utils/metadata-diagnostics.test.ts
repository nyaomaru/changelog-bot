import { describe, expect, test } from '@jest/globals';
import {
  createMetadataDiagnostics,
  mergeMetadataDiagnostics,
  recordMetadataLookupOutcome,
} from '@/utils/metadata-diagnostics.js';
import type { MetadataLookupResult } from '@/types/github.js';

describe('metadata-diagnostics', () => {
  describe('createMetadataDiagnostics', () => {
    test('initializes zeroed counters and empty lists', () => {
      const diagnostics = createMetadataDiagnostics();
      expect(diagnostics).toEqual({
        totalLookups: 0,
        successfulLookups: 0,
        degradedLookups: 0,
        failureCounts: {
          'not-found': 0,
          'rate-limited': 0,
          unauthenticated: 0,
          'invalid-response': 0,
          'network-error': 0,
        },
        fallbackReasons: [],
      });
    });
  });

  describe('recordMetadataLookupOutcome', () => {
    test('increments total and successful on success result', () => {
      const diagnostics = createMetadataDiagnostics();
      const successResult: MetadataLookupResult<string> = {
        status: 'success',
        data: 'release note body',
      };

      recordMetadataLookupOutcome(diagnostics, successResult);

      expect(diagnostics.totalLookups).toBe(1);
      expect(diagnostics.successfulLookups).toBe(1);
      expect(diagnostics.degradedLookups).toBe(0);
      expect(diagnostics.fallbackReasons).toEqual([]);
    });

    test('increments failure reason and records formatted fallback reason on degraded', () => {
      const diagnostics = createMetadataDiagnostics();
      const rateLimitedResult: MetadataLookupResult<string> = {
        status: 'rate-limited',
        message: 'API rate limit exceeded',
      };

      recordMetadataLookupOutcome(
        diagnostics,
        rateLimitedResult,
        'Release notes lookup rate-limited',
      );

      expect(diagnostics.totalLookups).toBe(1);
      expect(diagnostics.successfulLookups).toBe(0);
      expect(diagnostics.degradedLookups).toBe(1);
      expect(diagnostics.failureCounts['rate-limited']).toBe(1);
      expect(diagnostics.fallbackReasons).toEqual([
        'Release notes lookup rate-limited',
      ]);
    });

    test('uses fallback reason builder function when provided', () => {
      const diagnostics = createMetadataDiagnostics();
      const notFoundResult: MetadataLookupResult<string> = {
        status: 'not-found',
        message: 'Not found',
      };

      recordMetadataLookupOutcome(
        diagnostics,
        notFoundResult,
        (reason) => `Lookup failed with reason: ${reason}`,
      );

      expect(diagnostics.totalLookups).toBe(1);
      expect(diagnostics.degradedLookups).toBe(1);
      expect(diagnostics.failureCounts['not-found']).toBe(1);
      expect(diagnostics.fallbackReasons).toEqual([
        'Lookup failed with reason: not-found',
      ]);
    });
  });

  describe('mergeMetadataDiagnostics', () => {
    test('combines counts and deduplicates fallback reasons', () => {
      const first = createMetadataDiagnostics();
      first.totalLookups = 2;
      first.successfulLookups = 1;
      first.degradedLookups = 1;
      first.failureCounts['rate-limited'] = 1;
      first.fallbackReasons.push('Rate limit exceeded');

      const second = createMetadataDiagnostics();
      second.totalLookups = 3;
      second.successfulLookups = 2;
      second.degradedLookups = 1;
      second.failureCounts['not-found'] = 1;
      second.fallbackReasons.push('Rate limit exceeded');
      second.fallbackReasons.push('Release tag not found');

      const merged = mergeMetadataDiagnostics(first, second);

      expect(merged.totalLookups).toBe(5);
      expect(merged.successfulLookups).toBe(3);
      expect(merged.degradedLookups).toBe(2);
      expect(merged.failureCounts['rate-limited']).toBe(1);
      expect(merged.failureCounts['not-found']).toBe(1);
      expect(merged.fallbackReasons).toEqual([
        'Rate limit exceeded',
        'Release tag not found',
      ]);
    });
  });
});
