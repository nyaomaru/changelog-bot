import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { buildCliConfigJsonSchema } from '@/schema/config-file-json-schema.js';
import { CliConfigFileSchema } from '@/schema/config-file.js';

const PUBLISHED_SCHEMA_PATH = join(
  process.cwd(),
  'public',
  'config.schema.json',
);

describe('config JSON schema', () => {
  test('published public/config.schema.json is up to date', () => {
    const published = JSON.parse(readFileSync(PUBLISHED_SCHEMA_PATH, 'utf8'));

    // Regenerate with `pnpm generate:schema` when this fails.
    expect(published).toEqual(buildCliConfigJsonSchema());
  });

  test('describes every config key and forbids unknown ones', () => {
    const schema = buildCliConfigJsonSchema() as {
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };

    expect(Object.keys(schema.properties).sort()).toEqual(
      Object.keys(CliConfigFileSchema.shape).sort(),
    );
    expect(schema.properties).toHaveProperty('$schema');
    expect(schema.additionalProperties).toBe(false);
  });
});