import { SECTION_ORDER } from '@/constants/changelog.js';

/**
 * JSON Schema describing the expected LLM output structure for Phase 4 editorial responses.
 */
export const editorialOutputSchema = {
  type: 'object' as const,
  properties: {
    changes: {
      type: 'object' as const,
      additionalProperties: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          category: {
            type: 'string' as const,
            enum: [...SECTION_ORDER],
          },
        },
        additionalProperties: false,
      },
    },
  },
  required: ['changes'],
  additionalProperties: false,
};

export const outputSchema = editorialOutputSchema;
