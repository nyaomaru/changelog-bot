import { z } from 'zod';
import type { ReleaseChangeId } from '@/types/release.js';

export const WhyConfidenceSchema = z.enum(['low', 'medium', 'high']);

// WHY: Validate and narrow changeId to ReleaseChangeId when present. Malformed
// or non-matching change IDs from provider outputs are safely ignored as undefined
// rather than rejecting the entire extraction response.
export const ReleaseChangeIdSchema = z.preprocess(
  (val) =>
    typeof val === 'string' &&
    /^(?:pr:\d+(?::c\d+)?|commit:[0-9a-fA-F]+|release-note:\d+)$/.test(val)
      ? val
      : undefined,
  z.custom<ReleaseChangeId>((val) => typeof val === 'string').optional(),
);

export const WhyExtractionResultSchema = z.object({
  prNumber: z.number().int().positive(),
  changeId: ReleaseChangeIdSchema,
  why: z.string().min(1).max(240),
  confidence: WhyConfidenceSchema,
});

export const WhyExtractionOutputSchema = z.object({
  items: z.array(WhyExtractionResultSchema),
});

export type WhyExtractionOutputParsed = z.infer<
  typeof WhyExtractionOutputSchema
>;
