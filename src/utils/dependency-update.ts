import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';
import { BULLET_PREFIX_RE } from '@/constants/markdown.js';
import { BUMP_OR_UPGRADE_RE, VERSION_FROM_TO_RE } from '@/constants/scoring.js';

const CONVENTIONAL_SCOPE_RE = /^[a-z]+(?:\(([^)]+)\))?!?:/i;
const DEP_SCOPE_RE = /\bdeps(?:-dev|-prod)?\b|\bdependencies?\b/i;
const DEP_BOT_RE = /\brenovate\b|\bdependabot\b|\bdeps?bot\b/i;
const DEP_ACTION_RE = /\b(bump|upgrade|update|pin|refresh|lockfile)\b/i;
const DEP_VERSION_RE = /\bto\s+v?\d+(?:\.\d+){0,3}\b/i;

/**
 * Detect whether a title represents a dependency-only update.
 * @param rawTitle PR title or changelog bullet text to inspect.
 * @returns True when the title looks like a dependency update.
 */
export function isDependencyUpdateTitle(rawTitle: string): boolean {
  if (!rawTitle) return false;
  const trimmedTitle = rawTitle.replace(BULLET_PREFIX_RE, '').trim();
  if (!trimmedTitle) return false;

  const scopeMatch = trimmedTitle.match(CONVENTIONAL_SCOPE_RE);
  const scope = scopeMatch?.[1];
  if (scope && DEP_SCOPE_RE.test(scope)) return true;

  const lower = trimmedTitle.toLowerCase();
  if (DEP_BOT_RE.test(lower)) return true;

  const core = lower.replace(CONVENTIONAL_PREFIX_RE, '').trim();
  const hasDepPlural = /\bdeps\b|\bdependencies\b/.test(core);
  const hasDepSingular = /\bdependency\b/.test(core);
  const hasAction = DEP_ACTION_RE.test(core) || BUMP_OR_UPGRADE_RE.test(core);
  const hasVersionHint =
    VERSION_FROM_TO_RE.test(core) || DEP_VERSION_RE.test(core);

  if (hasDepPlural && hasAction) return true;
  if (hasDepSingular && hasAction && hasVersionHint) return true;

  return false;
}
