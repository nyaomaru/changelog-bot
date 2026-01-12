/**
 * Build a flexible conventional prefix regex that accepts optional scope and
 * optional breaking marker `!` before the colon.
 * WHY: This is a reusable helper used by multiple modules; keeping it in utils
 * avoids coupling regex construction to constants definitions.
 * @param types Single commit type or list of types (e.g., 'feat' or ['feat','fix']).
 * @returns Case-insensitive RegExp matching the conventional prefix portion.
 */
export function flexPrefixRe(types: string | string[]): RegExp {
  const body = Array.isArray(types) ? types.join('|') : types;
  // Matches: "type!:", "type(scope):", "type(scope)!:" (no space between type and scope)
  // Pattern: ^(type)(!:|(\(scope\))?:|(\(scope\))!:) with non-capturing alternation for scope and breaking marker
  return new RegExp(`^(${body})(?:!:|(?:\\([^)]*\\))?!?:)`, 'i');
}
