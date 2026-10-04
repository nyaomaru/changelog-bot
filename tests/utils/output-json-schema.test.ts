// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { outputSchema } from '@/utils/output-json-schema.js';
import { SECTION_ORDER } from '@/constants/changelog.js';

describe('output-json-schema', () => {
  test('generates editorial JSON schema requiring changes property', () => {
    expect(outputSchema.type).toBe('object');
    expect(outputSchema.required).toEqual(['changes']);
    expect(outputSchema.properties.changes).toBeDefined();
    expect(outputSchema.properties.changes.type).toBe('object');
    expect(
      outputSchema.properties.changes.additionalProperties.properties.title
        .type,
    ).toBe('string');
    expect(
      outputSchema.properties.changes.additionalProperties.properties.category
        .enum,
    ).toEqual(expect.arrayContaining([...SECTION_ORDER]));
  });
});
