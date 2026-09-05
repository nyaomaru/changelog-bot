import { SECTION_CHORE, SECTION_ORDER } from '@/constants/changelog.js';
import type {
  CategoryAssignments,
  ClassificationChange,
  ClassificationResult,
} from '@/types/changelog.js';
import type { ClassifyChangesOptions } from '@/types/provider.js';
import { isBucketName, isRecord } from '@/utils/is.js';

/** Prompt payload sent to classification LLMs. */
export type ClassificationPrompt = {
  /** Canonical IDs and normalized titles to categorize. */
  changes: ClassificationChange[];
  /** Ordered list of changelog categories to enforce. */
  categories: readonly string[];
};

/**
 * Build the shared classification prompt for provider-specific request code.
 * @param changes Release changes to classify by stable ID.
 * @returns Prompt payload containing changes and canonical categories.
 */
export function buildClassificationPrompt(
  changes: ClassificationChange[],
): ClassificationPrompt {
  return { changes, categories: SECTION_ORDER };
}

/**
 * Build a strict JSON schema for ID-to-category assignments.
 * @param changes Release changes expected in the provider response.
 * @returns JSON schema requiring one canonical category for every change ID.
 */
export function buildClassificationAssignmentsJsonSchema(
  changes: ClassificationChange[],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(
      changes.map(({ id }) => [
        id,
        { type: 'string', enum: [...SECTION_ORDER] },
      ]),
    ),
    required: changes.map(({ id }) => id),
    additionalProperties: false,
  };
}

/**
 * Return the deterministic fallback used when classification is unavailable.
 * @param changes Changes that could not be classified by a provider.
 * @returns Assignments placing every change under Chore.
 */
export function fallbackCategoryAssignments(
  changes: ClassificationChange[],
): CategoryAssignments {
  return Object.fromEntries(
    changes.map(({ id }) => [id, SECTION_CHORE]),
  ) as CategoryAssignments;
}

/**
 * Parse and reconcile a provider response against the requested change IDs.
 * WHY: Provider output is untrusted and may omit entries or invent IDs. Missing
 * IDs are recoverable, but unknown IDs and categories invalidate the response.
 * @param rawJson Serialized ID-to-category object returned by the provider.
 * @param changes Exact release changes included in the classification request.
 * @returns Reconciled assignments, or undefined for an invalid response.
 */
export function parseCategoryAssignments(
  rawJson: string,
  changes: ClassificationChange[],
): ClassificationResult | undefined {
  try {
    const parsed = JSON.parse(rawJson);
    if (!isRecord(parsed)) return undefined;

    const knownIds = new Set<string>(changes.map(({ id }) => id));
    if (knownIds.size !== changes.length) return undefined;

    const assignments = {} as CategoryAssignments;
    for (const [changeId, category] of Object.entries(parsed)) {
      if (!knownIds.has(changeId) || !isBucketName(category)) {
        return undefined;
      }
      assignments[changeId as keyof CategoryAssignments] = category;
    }

    const missingIds = changes
      .map(({ id }) => id)
      .filter((changeId) => assignments[changeId] === undefined);
    for (const changeId of missingIds) {
      assignments[changeId] = SECTION_CHORE;
    }

    const diagnostics = missingIds.length
      ? [
          `Classification response omitted ${missingIds.length} change ID(s): ${missingIds.join(', ')}; used deterministic fallback`,
        ]
      : [];
    return { assignments, diagnostics };
  } catch {
    return undefined;
  }
}

/**
 * Run provider classification with the shared fallback and error policy.
 * @param params Classification inputs and provider-specific request callback.
 * @returns Reconciled assignments and non-fatal diagnostics.
 */
export async function classifyChangesWithFallback(params: {
  changes: ClassificationChange[];
  hasApiKey: boolean;
  options?: ClassifyChangesOptions;
  request: () => Promise<string>;
  invalidResponseMessage: string;
}): Promise<ClassificationResult> {
  const {
    changes,
    hasApiKey,
    options = {},
    request,
    invalidResponseMessage,
  } = params;

  if (!changes.length) return { assignments: {}, diagnostics: [] };
  if (!hasApiKey) {
    return {
      assignments: fallbackCategoryAssignments(changes),
      diagnostics: [],
    };
  }

  try {
    const result = parseCategoryAssignments(await request(), changes);
    if (!result) throw new Error(invalidResponseMessage);
    return result;
  } catch (error) {
    if (options.throwOnError) throw error;
    return {
      assignments: fallbackCategoryAssignments(changes),
      diagnostics: [
        `${invalidResponseMessage}; used deterministic fallback for all changes`,
      ],
    };
  }
}
