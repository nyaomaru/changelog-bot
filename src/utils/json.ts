/**
 * Safely parse JSON, returning `undefined` on failure.
 * @param input Raw string to parse.
 * @returns Parsed value or `undefined`.
 */
export function safeJsonParse<T>(input: string): T | undefined {
  try {
    return JSON.parse(input) as T;
  } catch {
    return undefined;
  }
}
