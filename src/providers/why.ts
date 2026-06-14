import { WhyExtractionOutputSchema } from '@/schema/why.js';
import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';
import { extractJsonObject } from '@/utils/json-extract.js';

/** Shared WHY extraction system prompt. */
export const WHY_EXTRACTION_SYSTEM_PROMPT =
  'Extract concise changelog WHY notes from PR description candidates. Use only provided evidence. If the reason is unclear, indirect, or speculative, omit that PR. Return strict JSON.';

/** JSON schema requested from providers for WHY extraction output. */
export const whyExtractionJsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prNumber: { type: 'number' },
          why: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['prNumber', 'why', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/**
 * Build a compact provider payload for WHY extraction.
 * @param input Preprocessed WHY extraction input.
 * @returns JSON-serializable prompt object.
 */
export function buildWhyExtractionPrompt(input: WhyExtractionInput): unknown {
  return {
    task: 'For each PR, write one short WHY note only when the candidates clearly state why the change was made.',
    rules: [
      'Do not infer from code behavior, title alone, or general knowledge.',
      'Do not explain what changed unless it directly states why it changed.',
      'Omit PRs where the reason is unclear, weak, or only describes implementation details.',
      'Keep each WHY note to one sentence, 140 characters or fewer.',
      `Write WHY notes in this language: ${input.language}.`,
    ],
    output: {
      schema: whyExtractionJsonSchema,
      confidence:
        'Use high for explicit WHY/Reason/Motivation evidence, medium for clear context/problem evidence, and low for weak evidence.',
    },
    items: input.items.map((item) => ({
      prNumber: item.prNumber,
      title: item.title,
      changelogItem: item.itemText,
      localTrust: {
        score: item.trustScore,
        bucket: item.trustBucket,
        requiresHighConfidence: item.requiresHighConfidence,
      },
      candidates: item.candidates,
    })),
  };
}

/**
 * Parse and validate provider WHY extraction output.
 * @param rawText Provider response text.
 * @returns Normalized WHY extraction output.
 */
export function parseWhyExtractionOutput(rawText: string): WhyExtractionOutput {
  const parsedJson = extractJsonObject<unknown>(rawText || '{"items":[]}');
  const parsed = WhyExtractionOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('WHY extraction output did not match schema');
  }
  return parsed.data;
}
