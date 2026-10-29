import { z } from 'zod';
import { CliConfigFileSchema } from '@/schema/config-file.js';

/** Stable id of the published schema (also used for `$schema` hints). */
export const CLI_CONFIG_JSON_SCHEMA_ID =
  'https://raw.githubusercontent.com/nyaomaru/changelog-bot/main/public/config.schema.json';

/**
 * Build the JSON Schema for `changelog-bot.config.json`.
 * WHY: Deriving it from the Zod schema keeps runtime validation and editor
 * autocompletion in sync. Draft-07 is used for the widest editor support.
 */
export function buildCliConfigJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(CliConfigFileSchema, { target: 'draft-7' }),
    $id: CLI_CONFIG_JSON_SCHEMA_ID,
    title: 'changelog-bot config',
    description: 'Configuration file for @nyaomaru/changelog-bot.',
  };
}