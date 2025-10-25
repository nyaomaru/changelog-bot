// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { sanitizeLLMOutput } from '@/utils/sanitize.js';

describe('sanitizeLLMOutput', () => {
  test('returns null when input is null', () => {
    expect(sanitizeLLMOutput(null)).toBeNull();
  });

  test('keeps valid anchor', () => {
    const out = sanitizeLLMOutput({
      new_section_markdown: 'x',
      insert_after_anchor: '## [1.0.0] - header',
      pr_title: 't',
      pr_body: 'b',
      labels: ['a'],
    });

    expect(out?.insert_after_anchor).toBe('## [1.0.0] - header');
  });

  test('falls back to Unreleased anchor when missing or invalid', () => {
    const out = sanitizeLLMOutput({
      new_section_markdown: 'x',
      insert_after_anchor: 'Not a heading',
      pr_title: 't',
      pr_body: 'b',
      labels: ['a'],
    });

    expect(out?.insert_after_anchor).toBe('## [Unreleased]');
  });
});
