#!/usr/bin/env node
// Generate public/config.schema.json from the Zod config schema.
// Usage: `pnpm generate:schema` (builds first). The file is committed so users
// can reference it from `$schema`; a test fails when it drifts from the source.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT_PATH = join(process.cwd(), 'public', 'config.schema.json');
const BUILT_MODULE = join(
  process.cwd(),
  'dist',
  'schema',
  'config-file-json-schema.js',
);

const { buildCliConfigJsonSchema } = await import(
  pathToFileURL(BUILT_MODULE).href
);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify(buildCliConfigJsonSchema(), null, 2)}\n`,
  'utf8',
);
console.log(`Wrote ${OUTPUT_PATH}`);
