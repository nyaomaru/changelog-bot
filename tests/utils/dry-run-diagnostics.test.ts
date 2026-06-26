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
});
