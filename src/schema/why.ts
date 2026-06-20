import { z } from 'zod';

export const WhyConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const WhyExtractionResultSchema = z.object({
  prNumber: z.number().int().positive(),
  why: z.string().min(1).max(240),
  confidence: WhyConfidenceSchema,
});

export const WhyExtractionOutputSchema = z.object({
  items: z.array(WhyExtractionResultSchema),
});

export type WhyExtractionOutputParsed = z.infer<
  typeof WhyExtractionOutputSchema
>;
