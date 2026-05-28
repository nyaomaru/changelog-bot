import type { ProviderName } from '@/types/llm.js';

/**
 * Canonical provider identifiers used across CLI, providers, and factories.
 */
export const PROVIDER_OPENAI: ProviderName = 'openai';
export const PROVIDER_ANTHROPIC: ProviderName = 'anthropic';
export const PROVIDER_GEMINI: ProviderName = 'gemini';

/**
 * Ordered list used for CLI choices and validation.
 */
export const PROVIDER_NAMES = [
  PROVIDER_OPENAI,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
] as const;
