import {
  SECTION_ADDED,
  SECTION_BREAKING_CHANGES,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_FIXED,
  SECTION_ORDER,
  SECTION_REVERTED,
  SECTION_TEST,
} from '@/constants/changelog.js';
import {
  COMMIT_TYPES,
  CONVENTIONAL_BREAKING_PREFIX_RE,
  CONVENTIONAL_PREFIX_RE,
  REFACTOR_LIKE_RE,
} from '@/constants/conventional.js';
import type {
  BucketName,
  CategoryAssignments,
  CategoryScores,
  ClassificationChange,
  ClassificationSignal,
  DeterministicClassification,
} from '@/types/changelog.js';
import type { ReleaseChange } from '@/types/release.js';
import { bestCategory, scoreCategories } from '@/utils/category-score.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

type CommitType = (typeof COMMIT_TYPES)[number];

const COMMIT_TYPE_CATEGORIES: Record<CommitType, BucketName> = {
  feat: SECTION_ADDED,
  fix: SECTION_FIXED,
  refactor: SECTION_CHANGED,
  perf: SECTION_CHANGED,
  style: SECTION_CHANGED,
  docs: SECTION_DOCS,
  build: SECTION_CHORE,
  ci: SECTION_CHORE,
  test: SECTION_TEST,
  chore: SECTION_CHORE,
  revert: SECTION_REVERTED,
};

const TYPE_INTENT_INDICATORS = [
  'type',
  'types',
  'typing',
  'type definition',
  'type definitions',
  'typedef',
  'd.ts',
  'ts type',
  'option type',
];

const FIX_INTENT_INDICATORS = [
  'fix',
  'correct',
  'tighten',
  'narrow',
  'wrong',
  'invalid',
  'incorrect',
  'mismatch',
  'bug',
  'error',
];

const CHANGE_LIKE_INDICATORS = [
  'improve',
  'improvement',
  'enhance',
  'enhancement',
  'optimize',
  'optimization',
  'refine',
  'refinement',
  'streamline',
  'simplify',
  'polish',
  'rework',
  'revise',
  'revamp',
  'stabilize',
  'hardening',
  'harden',
  'tweak',
  'adjust',
  'tune',
  'tuning',
  'retune',
  'fine-tune',
  'fine tune',
  'finetune',
];

const SIGNAL_PRIORITY: Record<ClassificationSignal, number> = {
  breaking: 5,
  conventional: 4,
  'strong-semantic': 3,
  'weak-semantic': 2,
  fallback: 1,
};

const WEAK_PROVIDER_CATEGORIES = new Set<BucketName>([
  SECTION_CHORE,
  SECTION_DOCS,
  SECTION_TEST,
]);

function semanticTitleCore(rawTitle: string): string {
  return rawTitle.toLowerCase().replace(CONVENTIONAL_PREFIX_RE, '').trim();
}

function isImplicitFixTitle(rawTitle: string): boolean {
  const core = semanticTitleCore(rawTitle);
  const mentionsType = TYPE_INTENT_INDICATORS.some((keyword) =>
    core.includes(keyword),
  );
  const impliesFix = FIX_INTENT_INDICATORS.some((keyword) =>
    core.includes(keyword),
  );
  return (
    (mentionsType && impliesFix) ||
    (mentionsType && (core.includes('narrow') || core.includes('tighten')))
  );
}

function isChangeLikeTitle(rawTitle: string): boolean {
  const core = semanticTitleCore(rawTitle);
  return (
    REFACTOR_LIKE_RE.test(rawTitle) ||
    CHANGE_LIKE_INDICATORS.some((keyword) => core.includes(keyword))
  );
}

function conventionalCategory(rawTitle: string): BucketName | undefined {
  const match = CONVENTIONAL_PREFIX_RE.exec(rawTitle);
  if (!match?.[1]) return undefined;
  return COMMIT_TYPE_CATEGORIES[match[1].toLowerCase() as CommitType];
}

function highestScoringCategory(scores: CategoryScores): BucketName | null {
  let topCategory: BucketName | null = null;
  let topScore = 0;
  let secondScore = 0;

  for (const category of SECTION_ORDER) {
    const score = scores[category];
    if (score > topScore) {
      secondScore = topScore;
      topScore = score;
      topCategory = category;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  return topCategory && topScore > secondScore ? topCategory : null;
}

/**
 * Classify one title using the canonical deterministic precedence.
 * @param rawTitle Original title or commit subject, including any prefix.
 * @returns Category and the signal strength responsible for the decision.
 */
export function classifyTitleDeterministically(
  rawTitle: string,
): DeterministicClassification {
  if (CONVENTIONAL_BREAKING_PREFIX_RE.test(rawTitle)) {
    return { category: SECTION_BREAKING_CHANGES, signal: 'breaking' };
  }

  const prefixCategory = conventionalCategory(rawTitle);
  if (prefixCategory) {
    return { category: prefixCategory, signal: 'conventional' };
  }

  if (isDependencyUpdateTitle(rawTitle)) {
    return { category: SECTION_CHORE, signal: 'strong-semantic' };
  }
  if (isImplicitFixTitle(rawTitle)) {
    return { category: SECTION_FIXED, signal: 'strong-semantic' };
  }

  const scores = scoreCategories(rawTitle);
  const strongCategory = bestCategory(scores);
  if (strongCategory) {
    return { category: strongCategory, signal: 'strong-semantic' };
  }
  if (isChangeLikeTitle(rawTitle)) {
    return { category: SECTION_CHANGED, signal: 'strong-semantic' };
  }

  const weakCategory = highestScoringCategory(scores);
  if (weakCategory) {
    return { category: weakCategory, signal: 'weak-semantic' };
  }

  return { category: SECTION_CHORE, signal: 'fallback' };
}

/**
 * Classify normalized provider inputs without calling a provider.
 * @param changes Stable IDs and titles to classify.
 * @returns Complete deterministic assignments keyed by change ID.
 */
export function classifyChangesDeterministically(
  changes: readonly ClassificationChange[],
): CategoryAssignments {
  return Object.fromEntries(
    changes.map(({ id, title }) => [
      id,
      classifyTitleDeterministically(title).category,
    ]),
  ) as CategoryAssignments;
}

function changeTitles(
  change: ReleaseChange,
  classificationTitle?: string,
): string[] {
  return Array.from(
    new Set(
      [change.rawTitle, change.title, classificationTitle].filter(
        (title): title is string => Boolean(title),
      ),
    ),
  );
}

function strongestClassification(
  titles: string[],
): DeterministicClassification {
  let strongest: DeterministicClassification = {
    category: SECTION_CHORE,
    signal: 'fallback',
  };
  for (const title of titles) {
    const candidate = classifyTitleDeterministically(title);
    if (SIGNAL_PRIORITY[candidate.signal] > SIGNAL_PRIORITY[strongest.signal]) {
      strongest = candidate;
    }
  }
  return strongest;
}

function categoryAfterDeterministicRules(
  currentCategory: BucketName,
  decision: DeterministicClassification,
): BucketName {
  const shouldOverride =
    decision.signal === 'breaking' ||
    decision.signal === 'conventional' ||
    decision.signal === 'strong-semantic' ||
    (decision.signal === 'weak-semantic' &&
      WEAK_PROVIDER_CATEGORIES.has(currentCategory));
  return shouldOverride ? decision.category : currentCategory;
}

/**
 * Apply canonical rules directly to normalized provider inputs.
 * @param changes Stable IDs and normalized titles sent to the provider.
 * @param assignments Provider assignments keyed by change ID.
 * @returns Provider assignments corrected by deterministic precedence.
 */
export function applyDeterministicTitleClassification(
  changes: readonly ClassificationChange[],
  assignments: CategoryAssignments,
): CategoryAssignments {
  const adjusted = { ...assignments };
  for (const change of changes) {
    const currentCategory = adjusted[change.id] ?? SECTION_CHORE;
    adjusted[change.id] = categoryAfterDeterministicRules(
      currentCategory,
      classifyTitleDeterministically(change.title),
    );
  }
  return adjusted;
}

/**
 * Apply canonical hard rules and semantic corrections to provider assignments.
 * @param changes Canonical release changes to reconcile.
 * @param assignments Provider or fallback assignments keyed by change ID.
 * @param classificationChanges Normalized titles sent to the provider.
 * @returns Assignments corrected by the deterministic precedence.
 */
export function applyDeterministicClassification(
  changes: readonly ReleaseChange[],
  assignments: CategoryAssignments,
  classificationChanges: readonly ClassificationChange[] = [],
): CategoryAssignments {
  const adjusted = { ...assignments };
  const classificationTitles = new Map(
    classificationChanges.map(({ id, title }) => [id, title]),
  );

  for (const change of changes) {
    const decision = strongestClassification(
      changeTitles(change, classificationTitles.get(change.id)),
    );
    const currentCategory = adjusted[change.id] ?? SECTION_CHORE;
    adjusted[change.id] = categoryAfterDeterministicRules(
      currentCategory,
      decision,
    );
  }

  return adjusted;
}
