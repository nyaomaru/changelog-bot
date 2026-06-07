// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { outputSchema } from '@/utils/output-json-schema.js';

describe('output-json-schema', () => {
  test('generates JSON schema with required fields and string/array types', () => {
    expect(outputSchema.type).toBe('object');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = outputSchema.properties as any;
    // Keys from LLMOutputSchema
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining([
        'new_section_markdown',
        'insert_after_anchor',
        'compare_link_line',
        'unreleased_compare_update',
        'pr_title',
        'pr_body',
        'labels',
      ]),
    );
    // Required should include non-optional base fields
    expect(new Set(outputSchema.required)).toEqual(
      new Set(['new_section_markdown', 'pr_title', 'pr_body']),
    );
    expect(props.new_section_markdown).toEqual({ type: 'string' });
    expect(props.pr_title).toEqual({ type: 'string' });
    expect(props.pr_body).toEqual({ type: 'string' });
    expect(props.labels).toEqual({ type: 'array', items: { type: 'string' } });
  });

  test('matches provider-facing schema golden shape', () => {
    expect(outputSchema).toMatchInlineSnapshot(`
{
  "properties": {
    "compare_link_line": {
      "type": "string",
    },
    "insert_after_anchor": {
      "type": "string",
    },
    "labels": {
      "items": {
        "type": "string",
      },
      "type": "array",
    },
    "new_section_markdown": {
      "type": "string",
    },
    "pr_body": {
      "type": "string",
    },
    "pr_title": {
      "type": "string",
    },
    "unreleased_compare_update": {
      "type": "string",
    },
  },
  "required": [
    "new_section_markdown",
    "pr_title",
    "pr_body",
  ],
  "type": "object",
}
`);
  });
});
