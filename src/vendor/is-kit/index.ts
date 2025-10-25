/**
 * Minimal vendored subset of https://github.com/nyaomaru/is-kit.
 * WHY: We depend on these type guards across the CLI but want a single
 * canonical implementation that mirrors the shared utilities package.
 */

export type Primitive =
  | string
  | number
  | boolean
  | symbol
  | bigint
  | undefined
  | null;

/**
 * Determine whether a value is a plain object record (non-null object).
 * @param value Unknown candidate.
 * @returns True when the value is an object and not null.
 */
export function isRecord(
  value: unknown
): value is Record<string | number | symbol, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Narrow unknown values to string.
 * @param value Unknown candidate.
 * @returns True when the value is a string.
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Narrow unknown values to number (including NaN and Infinity).
 * @param value Unknown candidate.
 * @returns True when the value is a number.
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Narrow unknown values to boolean.
 * @param value Unknown candidate.
 * @returns True when the value is a boolean.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Determine whether a value is a JavaScript primitive (including null/undefined).
 * @param value Unknown candidate.
 * @returns True when the value is a primitive.
 */
export function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  );
}

