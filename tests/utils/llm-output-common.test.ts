import { describe, expect, test } from '@jest/globals';
import { resolvePrFromTitles } from '@/utils/llm-output-common.js';

describe('resolvePrFromTitles', () => {
  test('ignores missing and empty titles even when the empty key matches', () => {
    expect(
      resolvePrFromTitles({ '': 99, 'add export': 12 }, [
        undefined,
        '',
        'Add Export',
      ]),
    ).toBe(12);
    expect(resolvePrFromTitles({ '': 99 }, [undefined, ''])).toBeUndefined();
  });

  test('preserves whitespace titles and the first matching title', () => {
    expect(resolvePrFromTitles({ ' ': 7, second: 8 }, [' ', 'Second'])).toBe(7);
    expect(
      resolvePrFromTitles({ first: 12, second: 13 }, ['First', 'Second']),
    ).toBe(12);
  });
});
