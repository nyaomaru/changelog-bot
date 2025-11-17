import type { Env } from '@/schema/env.js';

/**
 * Typed environment accessor. Prefer values from a validated Env object
 * when provided; otherwise falls back to process.env.
 */
export function getEnv<K extends keyof Env>(
  key: K,
  parsed?: Env
): Env[K] | undefined {
  if (parsed) return parsed[key];
  return process.env[key] as unknown as Env[K] | undefined;
}

