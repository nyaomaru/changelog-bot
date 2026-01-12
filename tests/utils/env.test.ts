// @ts-nocheck
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { Env } from '@/schema/env.js';
import { getEnv } from '@/utils/env.js';

describe('getEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_APP_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('prefers parsed env when provided', () => {
    const parsed: Env = { GITHUB_TOKEN: 'from-parsed' };
    process.env.GITHUB_TOKEN = 'from-process';
    expect(getEnv('GITHUB_TOKEN', parsed)).toBe('from-parsed');
  });

  test('falls back to process.env when parsed is undefined', () => {
    process.env.GITHUB_TOKEN = 'from-process';
    expect(getEnv('GITHUB_TOKEN', undefined)).toBe('from-process');
  });

  test('returns undefined when not in parsed nor process.env', () => {
    const parsed: Env = {} as Env;
    expect(getEnv('GITHUB_APP_ID', parsed)).toBeUndefined();
  });
});
