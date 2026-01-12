// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import {
  AppError,
  ConfigError,
  GitError,
  LlmError,
  ValidationError,
  mapErrorToExitCode,
} from '@/lib/errors.js';
import {
  EXIT_DATA,
  EXIT_LLM,
  EXIT_USAGE,
  EXIT_VALIDATION,
} from '@/constants/errors.js';

describe('typed errors and exit codes', () => {
  test('ConfigError maps to EXIT_USAGE', () => {
    const err = new ConfigError('bad flag');
    expect(err.exitCode).toBe(EXIT_USAGE);
    expect(mapErrorToExitCode(err)).toBe(EXIT_USAGE);
    expect(err.name).toBe('ConfigError');
  });

  test('GitError maps to EXIT_DATA', () => {
    const err = new GitError('repo broken');
    expect(err.exitCode).toBe(EXIT_DATA);
    expect(mapErrorToExitCode(err)).toBe(EXIT_DATA);
  });

  test('LlmError maps to EXIT_LLM', () => {
    const err = new LlmError('provider error');
    expect(err.exitCode).toBe(EXIT_LLM);
    expect(mapErrorToExitCode(err)).toBe(EXIT_LLM);
  });

  test('ValidationError maps to EXIT_VALIDATION', () => {
    const err = new ValidationError('schema mismatch');
    expect(err.exitCode).toBe(EXIT_VALIDATION);
    expect(mapErrorToExitCode(err)).toBe(EXIT_VALIDATION);
  });

  test('AppError preserves custom exit code', () => {
    const err = new AppError('custom', 42);
    expect(mapErrorToExitCode(err)).toBe(42);
  });

  test('defaults to 1 for unknown or no exitCode', () => {
    const noCode = new AppError('no code');
    expect(mapErrorToExitCode(noCode)).toBe(1);
    expect(mapErrorToExitCode(new Error('plain'))).toBe(1);
    expect(mapErrorToExitCode('not an error')).toBe(1);
  });
});
