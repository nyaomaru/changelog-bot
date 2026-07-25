// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { versionFromRef } from '@/utils/version.js';

describe('versionFromRef', () => {
  test('strips a leading v before a numeric version', () => {
    expect(versionFromRef('v1.2.3')).toBe('1.2.3');
  });
  test('preserves a leading v in an ordinary label', () => {
    expect(versionFromRef('version-2026')).toBe('version-2026');
  });
  test('HEAD maps to dev version', () => {
    expect(versionFromRef('HEAD')).toBe('0.0.0-dev');
  });
  test('passes through other refs', () => {
    expect(versionFromRef('1.2.3')).toBe('1.2.3');
  });
});
