import { z } from 'zod';

export const LLMOutputSchema = z.object({
  new_section_markdown: z.string(),
  insert_after_anchor: z.string().optional().default('## [Unreleased]'),
  compare_link_line: z.string().optional(),
  unreleased_compare_update: z.string().optional(),
  pr_title: z.string(),
  pr_body: z.string(),
  labels: z.array(z.string()).optional().default(['changelog', 'release']),
});

export type ParsedLLM = z.infer<typeof LLMOutputSchema>;
