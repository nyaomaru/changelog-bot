import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DEFAULT_CLI_CONFIG_FILE } from '@/constants/config.js';
import {
  CliConfigFileSchema,
  type CliConfigFile,
} from '@/schema/config-file.js';
import { ConfigError } from '@/lib/errors.js';

const CLI_CONFIG_ENCODING = 'utf8';

/**
 * Load optional CLI configuration from JSON.
 * @param configPath Explicit config path; defaults to `changelog-bot.config.json`.
 * @param cwd Directory used to resolve relative config paths.
 * @returns Parsed config values, or an empty object when the default file is absent.
 */
export function loadCliConfigFile(
  configPath?: string,
  cwd = process.cwd(),
): CliConfigFile {
  const isExplicitConfig = Boolean(configPath);
  const resolvedPath = resolve(cwd, configPath ?? DEFAULT_CLI_CONFIG_FILE);

  if (!existsSync(resolvedPath)) {
    if (isExplicitConfig) {
      throw new ConfigError(`Config file not found: ${resolvedPath}`);
    }
    return {};
  }

  try {
    const rawConfig = JSON.parse(
      readFileSync(resolvedPath, CLI_CONFIG_ENCODING),
    );
    return CliConfigFileSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ConfigError(
        `Invalid config file ${resolvedPath}: ${z.prettifyError(error)}`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Invalid config file ${resolvedPath}: ${message}`);
  }
}
