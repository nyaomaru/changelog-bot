import type { ProviderName } from '@/types/llm.js';

/**
 * Canonical provider identifiers used across CLI, providers, and factories.
 */
export const PROVIDER_OPENAI: ProviderName = 'openai';
export const PROVIDER_ANTHROPIC: ProviderName = 'anthropic';

/**
 * Ordered list used for CLI choices and validation.
 */
export const PROVIDER_NAMES = [PROVIDER_OPENAI, PROVIDER_ANTHROPIC] as const;
