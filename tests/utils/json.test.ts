// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { safeJsonParse } from '@/utils/json.js';

describe('safeJsonParse', () => {
  test('parses valid JSON object', () => {
    const input = '{"a":1,"b":"x"}';

    const parsed = safeJsonParse<{ a: number; b: string }>(input);

    expect(parsed).toEqual({ a: 1, b: 'x' });
  });

  test('returns undefined on invalid JSON', () => {
    const input = '{"a":1'; // broken JSON

    const parsed = safeJsonParse<Record<string, unknown>>(input);

    expect(parsed).toBeUndefined();
  });

  test('parses arrays and preserves types when valid', () => {
    const input = '[1,2,3]';
    const parsed = safeJsonParse<number[]>(input);

    expect(Array.isArray(parsed)).toBe(true);

    expect(parsed).toEqual([1, 2, 3]);
  });
});
