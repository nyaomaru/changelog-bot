import {
  arrayOf,
  define,
  isArray,
  isError,
  isInstanceOf as createInstanceGuard,
  isNaN,
  isNull,
  isNumber,
  isObject,
  isPrimitive,
  isSafeInteger,
  isString,
  isUndefined,
  oneOf,
  type Guard,
} from 'is-kit';
import { SECTION_ORDER } from '@/constants/changelog.js';
import type { BucketName } from '@/types/changelog.js';

export {
  arrayOf,
  isArray,
  isError,
  isNaN,
  isNull,
  isNumber,
  isPrimitive,
  isSafeInteger,
  isString,
  isUndefined,
};

/**
 * Create a guard for instances of a constructor.
 * WHY: is-kit 1.6 types constructor parameters as `unknown[]`, which rejects
 * ordinary constructors under strict function variance even though runtime
 * instance checks do not invoke the constructor.
 * @param constructor Class constructor used for the instance check.
 * @returns Guard narrowing values to the constructor's instance type.
 */
export function isInstanceOf<Instance>(
  constructor: abstract new (...args: never[]) => Instance,
): Guard<Instance> {
  return createInstanceGuard(
    constructor as unknown as abstract new (...args: unknown[]) => Instance,
  );
}

/**
 * Determine whether a value is null or undefined.
 * @param value Unknown candidate.
 * @returns True when the value is nullish (null or undefined).
 */
export const isNullable = oneOf(isNull, isUndefined);

/**
 * Determine whether a value is a plain object record (non-null object).
 * @param value Unknown candidate.
 * @returns True when the value is an object and not null.
 */
export const isRecord = define<Record<string | number | symbol, unknown>>(
  (value) => isObject(value) && !isNull(value),
);

/**
 * Detect whether a model string refers to a reasoning-capable OpenAI family.
 * Background: We toggle temperature vs. reasoning payload fields based on model.
 * @param modelName Model name (e.g., "gpt-4o", "o3-mini", "gpt-5.1-reasoning").
 * @returns True when the model implies reasoning features.
 */
export function isReasoningModel(modelName: string): boolean {
  return /(?:gpt-5|o3|o4|reason|thinking)/i.test(modelName);
}

/**
 * Checks if a markdown line is a bullet item ("- " or "* ").
 * @param line Single line of markdown text.
 * @returns True when the line starts with a bullet marker.
 */
export function isBulletLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

/**
 * Type guard for changelog bucket names.
 * WHY: Keep the predicate reusable and composable via `define` so it
 * plays nicely with other guard combinators from is-kit.
 * @param section Arbitrary section candidate.
 * @returns True when `section` is one of SECTION_ORDER.
 */
export const isBucketName = define<BucketName>(
  (section) =>
    isString(section) && (SECTION_ORDER as readonly string[]).includes(section),
);
