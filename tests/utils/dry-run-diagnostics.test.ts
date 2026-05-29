import { describe, expect, test } from '@jest/globals';
import { formatDryRunDiagnostics } from '@/utils/dry-run-diagnostics.js';

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
      }),
    ).toContain('Fallback reasons: Missing API key for provider: openai');
  });
});
