// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import {
  isRecord,
  isString,
  isPrimitive,
  isNumber,
  isReasoningModel,
  isBulletLine,
} from '@/utils/is.js';

describe('is utilities', () => {
  test('isRecord', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  test('isString', () => {
    expect(isString('a')).toBe(true);
    expect(isString(1)).toBe(false);
  });

  test('isPrimitive', () => {
    expect(isPrimitive(1)).toBe(true);
    expect(isPrimitive('x')).toBe(true);
    expect(isPrimitive(null)).toBe(true);
    expect(isPrimitive(undefined)).toBe(true);
    expect(isPrimitive(Symbol('s'))).toBe(true);
    expect(isPrimitive(BigInt(1))).toBe(true);
    expect(isPrimitive({})).toBe(false);
    expect(isPrimitive(() => {})).toBe(false);
  });

  test('isNumber', () => {
    expect(isNumber(Infinity)).toBe(true);
    expect(isNumber('1')).toBe(false);
  });

  test('isReasoningModel', () => {
    expect(isReasoningModel('o3-mini')).toBe(true);
    expect(isReasoningModel('gpt-5.1-reasoning')).toBe(true);
    expect(isReasoningModel('gpt-4o')).toBe(false);
  });

  test('isBulletLine', () => {
    expect(isBulletLine('- item')).toBe(true);
    expect(isBulletLine('  * item')).toBe(true);
    expect(isBulletLine('item')).toBe(false);
  });
});
