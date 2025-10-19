/**
 * Safely parse JSON, returning `undefined` on failure.
 * @param input Raw string to parse.
 * @returns Parsed value or `undefined`.
 */
function safeJsonParse<T>(input: string): T | undefined {
  try {
    return JSON.parse(input) as T;
  } catch {
    return undefined;
  }
}

/**
 * Extract a JSON object from raw LLM text which might include prose around it.
 * WHY: Models sometimes wrap JSON in explanations; we scan braces to salvage a valid object.
 * @param rawText Unstructured model output.
 * @returns Parsed JSON object of type `T` if found.
 * @throws When no JSON object can be parsed.
 */
export function extractJsonObject<T = unknown>(rawText: string): T {
  const strategies: Array<(text: string) => T | undefined> = [
    tryParseDirect,
    tryParseOutermostSpan,
    tryParseBalancedObject,
  ];

  for (const attemptParse of strategies) {
    const parsed = attemptParse(rawText);
    if (parsed !== undefined) return parsed;
  }

  throw new Error('Failed to parse JSON from model output');
}

/**
 * Attempt to parse the entire string as JSON.
 * @param text Model output to parse.
 * @returns Parsed JSON when the text is valid JSON.
 */
function tryParseDirect<T>(text: string): T | undefined {
  return safeJsonParse<T>(text);
}

/**
 * Attempt to trim leading/trailing prose by slicing the outermost braces.
 * @param text Model output that might wrap JSON with explanations.
 * @returns Parsed JSON when outermost braces hold a valid object.
 */
function tryParseOutermostSpan<T>(text: string): T | undefined {
  const firstBraceIndex = text.indexOf('{');
  const lastBraceIndex = text.lastIndexOf('}');
  if (firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return undefined;
  }

  return safeJsonParse<T>(text.slice(firstBraceIndex, lastBraceIndex + 1));
}

/**
 * Attempt to recover nested JSON objects by scanning balanced braces.
 * WHY: Some providers prepend status messages before the actual JSON payload;
 * scanning brace pairs lets us salvage a valid object buried inside.
 * @param text Model output that may include nested JSON snippets.
 * @returns Parsed JSON when a balanced segment parses successfully.
 */
function tryParseBalancedObject<T>(text: string): T | undefined {
  const braceStack: number[] = [];
  let innermostValidObject: T | undefined;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (character === '{') {
      braceStack.push(index);
      continue;
    }

    if (character !== '}' || braceStack.length === 0) {
      continue;
    }

    const startIndex = braceStack.pop()!;
    const candidate = safeJsonParse<T>(text.slice(startIndex, index + 1));

    if (candidate === undefined) {
      continue;
    }

    if (braceStack.length === 0) {
      return candidate;
    }

    // WHY: Prefer the outermost valid object, but fall back to a nested one
    // when nothing higher-level parses cleanly.
    innermostValidObject = candidate;
  }

  return innermostValidObject;
}
