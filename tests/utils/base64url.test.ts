// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { base64url } from '@/utils/base64url.js';

describe('base64url', () => {
  test('encodes ascii string without padding', () => {
    // base64('hello') = 'aGVsbG8=' -> url-safe, no padding => 'aGVsbG8'
    expect(base64url('hello')).toBe('aGVsbG8');
  });

  test('removes all = padding', () => {
    // base64('f') = 'Zg==' -> 'Zg'
    expect(base64url('f')).toBe('Zg');
  });

  test('replaces + and / with - and _', () => {
    // Buffer [251, 255, 239] -> base64 '+//v' -> url-safe '-__v'
    expect(base64url(Buffer.from([251, 255, 239]))).toBe('-__v');
  });
});
