// @ts-nocheck
import { extractJsonObject } from '@/utils/json-extract.js';

describe('extractJsonObject', () => {
  it('returns parsed object when input is pure JSON', () => {
    const data = extractJsonObject<{ foo: string }>('{"foo":"bar"}');

    expect(data).toEqual({ foo: 'bar' });
  });

  it('extracts JSON surrounded by explanatory prose', () => {
    const raw = 'Here you go! {"count": 3, "items": [1, 2, 3]} Thanks!';

    const parsed = extractJsonObject<{ count: number; items: number[] }>(raw);

    expect(parsed).toEqual({ count: 3, items: [1, 2, 3] });
  });

  it('recovers JSON when earlier braces contain invalid content', () => {
    const raw =
      'metadata: {not valid} -> {"valid": true, "nested": {"value": 4}}';

    const parsed = extractJsonObject<{
      valid: boolean;
      nested: { value: number };
    }>(raw);

    expect(parsed).toEqual({ valid: true, nested: { value: 4 } });
  });

  it('throws a descriptive error when no JSON object is present', () => {
    expect(() => extractJsonObject('No JSON available here.')).toThrow(
      'Failed to parse JSON from model output',
    );
  });
});
