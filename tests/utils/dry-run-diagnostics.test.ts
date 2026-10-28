import { describe, expect, test } from '@jest/globals';
import {
  formatDryRunDiagnostics,
  formatDryRunJsonReport,
} from '@/utils/dry-run-diagnostics.js';

describe('formatDryRunDiagnostics', () => {
  test('renders provider usage when AI was used', () => {
    expect(
      formatDryRunDiagnostics({
        providerName: 'gemini',
        modelName: 'gemini-3.5-flash',
        aiUsed: true,
        fallbackReasons: [],
      }),
    ).toBe(
      [
        'Provider: gemini',
        'Model: gemini-3.5-flash',
        'AI used: true',
        'Fallback reasons: none',
      ].join('\n'),
    );
  });

  test('renders fallback reasons when provider usage was skipped', () => {
    expect(
      formatDryRunDiagnostics({
        providerName: 'openai',
        modelName: 'gpt-4o-mini',
        aiUsed: false,
        fallbackReasons: ['Missing API key for provider: openai'],
        promptCustomization: {
          requested: true,
          resolved: true,
          applied: false,
          reason: 'not applied because provider API key is missing',
          sources: ['file'],
          chars: 24,
          maxChars: 16000,
          encoding: 'utf8',
          truncated: false,
          fileStatus: 'loaded',
          filePath: '.github/changelog-instructions.md',
        },
      }),
    ).toContain(
      'Prompt customization: requested=true, applied=false, sources=file, chars=24/16000, encoding=utf8',
    );
  });

  test('renders machine-readable JSON report', () => {
    expect(
      JSON.parse(
        formatDryRunJsonReport({
          providerName: 'openai',
          modelName: 'gpt-4o-mini',
          aiUsed: false,
          fallbackReasons: ['AI disabled by --no-ai'],
          promptCustomization: {
            requested: true,
            resolved: true,
            applied: false,
            reason: 'not applied because --no-ai skips provider generation',
            sources: ['inline'],
            chars: 19,
            maxChars: 16000,
            encoding: 'utf8',
            truncated: false,
            fileStatus: 'not_provided',
          },
        }),
      ),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      aiUsed: false,
      fallbackReasons: ['AI disabled by --no-ai'],
      promptCustomization: {
        requested: true,
        resolved: true,
        applied: false,
        reason: 'not applied because --no-ai skips provider generation',
        sources: ['inline'],
        chars: 19,
        maxChars: 16000,
        encoding: 'utf8',
        truncated: false,
        fileStatus: 'not_provided',
      },
    });
  });

  test('renders machine-readable JSON report with outcome', () => {
    expect(
      JSON.parse(
        formatDryRunJsonReport({
          providerName: 'openai',
          modelName: 'gpt-4o-mini',
          aiUsed: false,
          fallbackReasons: [],
          outcome: {
            kind: 'no-changes',
            version: '1.0.0',
            date: '2026-10-14',
            excludedChanges: [],
          },
        }),
      ),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      aiUsed: false,
      fallbackReasons: [],
      outcome: {
        kind: 'no-changes',
        version: '1.0.0',
        date: '2026-10-14',
        excludedChanges: [],
      },
    });
  });

  test('renders release outcome in text diagnostics when present', () => {
    expect(
      formatDryRunDiagnostics({
        providerName: 'openai',
        modelName: 'gpt-4o-mini',
        aiUsed: false,
        fallbackReasons: [],
        outcome: {
          kind: 'no-changes',
          version: '1.0.0',
          date: '2026-10-14',
          excludedChanges: [],
        },
      }),
    ).toContain('Release outcome: no-changes');
  });
  test('renders metadata diagnostics in text report when present', () => {
    expect(
      formatDryRunDiagnostics({
        providerName: 'openai',
        modelName: 'gpt-4o-mini',
        aiUsed: false,
        fallbackReasons: [],
        metadata: {
          totalLookups: 5,
          successfulLookups: 3,
          degradedLookups: 2,
          failureCounts: {
            'not-found': 1,
            'rate-limited': 1,
            unauthenticated: 0,
            'invalid-response': 0,
            'network-error': 0,
          },
          fallbackReasons: ['API rate limit exceeded', 'Commit abc not found'],
        },
      }),
    ).toContain(
      [
        'Metadata lookups: total=5, successful=3, degraded=2',
        'Metadata fallback reasons: API rate limit exceeded; Commit abc not found',
      ].join('\n'),
    );
  });

  test('renders metadata diagnostics with none when fallback reasons are empty', () => {
    expect(
      formatDryRunDiagnostics({
        providerName: 'openai',
        modelName: 'gpt-4o-mini',
        aiUsed: false,
        fallbackReasons: [],
        metadata: {
          totalLookups: 2,
          successfulLookups: 2,
          degradedLookups: 0,
          failureCounts: {
            'not-found': 0,
            'rate-limited': 0,
            unauthenticated: 0,
            'invalid-response': 0,
            'network-error': 0,
          },
          fallbackReasons: [],
        },
      }),
    ).toContain(
      [
        'Metadata lookups: total=2, successful=2, degraded=0',
        'Metadata fallback reasons: none',
      ].join('\n'),
    );
  });

  test('renders metadata diagnostics in machine-readable JSON report', () => {
    const metadata = {
      totalLookups: 4,
      successfulLookups: 3,
      degradedLookups: 1,
      failureCounts: {
        'not-found': 1,
        'rate-limited': 0,
        unauthenticated: 0,
        'invalid-response': 0,
        'network-error': 0,
      },
      fallbackReasons: ['Commit not found'],
    };

    expect(
      JSON.parse(
        formatDryRunJsonReport({
          providerName: 'openai',
          modelName: 'gpt-4o-mini',
          aiUsed: true,
          fallbackReasons: [],
          metadata,
        }),
      ),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      aiUsed: true,
      fallbackReasons: [],
      metadata,
    });
  });
});
