import { z } from 'zod';
import { SECTION_ORDER } from '@/constants/changelog.js';

/** Single release change editorial adjustment proposed by an LLM. */
export const EditorialChangeSchema = z.object({
  /** Polished, human-friendly title preserving the change intent (must be a single line). */
  title: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^\r\n]+$/, 'Editorial title must be a single line')
    .optional(),
  /** Proposed category classification, subject to deterministic precedence. */
  category: z.enum(SECTION_ORDER).optional(),
});

/** Sparse editorial payload returned by provider in Phase 4. */
export const EditorialOutputSchema = z.object({
  /** Sparse dictionary of change adjustments keyed by canonical ReleaseChangeId. */
  changes: z.record(z.string(), EditorialChangeSchema),
});

export type EditorialChange = z.infer<typeof EditorialChangeSchema>;
export type EditorialOutput = z.infer<typeof EditorialOutputSchema>;
