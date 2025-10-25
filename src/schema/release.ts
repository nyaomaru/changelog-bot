import { z } from 'zod';

// WHY: Ensure parsed release notes conform to expected shapes before use.

export const ReleaseItemSchema = z.object({
  title: z.string(),
  rawTitle: z.string().optional(),
  author: z.string().optional(),
  pr: z.number().optional(),
  url: z.string().url().optional(),
});

export const ReleaseSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
});

export const ParsedReleaseSchema = z.object({
  items: z.array(ReleaseItemSchema),
  fullChangelog: z.string().url().optional(),
  sections: z.array(ReleaseSectionSchema).optional(),
});

export type ReleaseItemParsed = z.infer<typeof ReleaseItemSchema>;
export type ParsedReleaseParsed = z.infer<typeof ParsedReleaseSchema>;
export type ReleaseSectionParsed = z.infer<typeof ReleaseSectionSchema>;
