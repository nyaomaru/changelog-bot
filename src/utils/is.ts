import {
  arrayOf as createArrayOfGuard,
  define,
  isArray as isArrayValue,
  isError as isErrorValue,
  isInstanceOf as createInstanceGuard,
  isNaN as isNaNValue,
  isNull,
  isNumber,
  isObject,
  isPrimitive,
  isSafeInteger as isSafeIntegerValue,
  isString,
  isUndefined as isUndefinedValue,
  oneOf,
  type Guard,
} from 'is-kit';
import { SECTION_ORDER } from '@/constants/changelog.js';
import type { BucketName } from '@/types/changelog.js';

export { isNull, isNumber, isPrimitive, isString };

/**
 * Create a guard that accepts arrays whose elements all satisfy a guard.
 * @param elementGuard Guard applied to every array element.
 * @returns Guard narrowing unknown values to a readonly array of guarded elements.
 */
export const arrayOf = createArrayOfGuard;

/**
 * Determine whether a value is an array.
 * @param value Unknown candidate.
 * @returns True when the value is an array, narrowing it to a readonly unknown array.
 */
export const isArray = isArrayValue;

/**
 * Determine whether a value represents an Error object.
 * @param value Unknown candidate.
 * @returns True for Error instances or values with the built-in Error object tag.
 */
export const isError = isErrorValue;

/**
 * Determine whether a value is the numeric NaN value without coercion.
 * @param value Unknown candidate.
 * @returns True only for NaN, narrowing the value to number.
 */
export const isNaN = isNaNValue;

/**
 * Determine whether a value is an integer within JavaScript's safe range.
 * @param value Unknown candidate.
 * @returns True for safe integer numbers, narrowing the value to number.
 */
export const isSafeInteger = isSafeIntegerValue;

/**
 * Determine whether a value is exactly undefined.
 * @param value Unknown candidate.
 * @returns True only for undefined, narrowing the value accordingly.
 */
export const isUndefined = isUndefinedValue;

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
