// Regex patterns used by the weighted scoring heuristic.
// Extracted for readability and future configurability.

// Conventional prefix breaking marker: matches `type!: message` and `type(scope)!: message`
export const BREAKING_PREFIX_MARKER_RE = /!:\s*/;

// Combo patterns
export const COMBO_ADD_TO_IMPROVE_RE = /add .* to (improve|optimiz|refine|streamline|simplif)/i;
export const COMBO_TIGHTEN_TYPE_RE = /(tighten|narrow).* (type|contract)/i;
export const COMBO_FIX_BY_ADDING_RE = /fix .* by add(ing)?/i;
export const COMBO_REMOVE_WITHOUT_REPLACEMENT_RE = /remove .* (without|no) (replacement|fallback)/i;

// Dependency bump patterns
export const BUMP_OR_UPGRADE_RE = /bump|upgrade/i;
export const VERSION_FROM_TO_RE = /from\s+(\d+)\b.*to\s+(\d+)\b/i;

