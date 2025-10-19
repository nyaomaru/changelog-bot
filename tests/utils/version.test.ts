// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { versionFromRef } from '@/utils/version.js';

describe('versionFromRef', () => {
  test('strips leading v', () => {
    expect(versionFromRef('v1.2.3')).toBe('1.2.3');
  });
  test('HEAD maps to dev version', () => {
    expect(versionFromRef('HEAD')).toBe('0.0.0-dev');
  });
  test('passes through other refs', () => {
    expect(versionFromRef('1.2.3')).toBe('1.2.3');
  });
});
