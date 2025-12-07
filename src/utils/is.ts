import {
  isString,
  isNull,
  isObject,
  define,
  isPrimitive,
  isNumber,
} from 'is-kit';

export { isString, isNumber, isNull, isPrimitive };

/**
 * Determine whether a value is null or undefined.
 * @param value Unknown candidate.
 * @returns True when the value is nullish (null or undefined).
 */
export const isNullable = define<null | undefined>((value) => value == null);

/**
 * Determine whether a value is a plain object record (non-null object).
 * @param value Unknown candidate.
 * @returns True when the value is an object and not null.
 */
export const isRecord = define<Record<string | number | symbol, unknown>>(
  (value) => isObject(value) && !isNull(value)
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
