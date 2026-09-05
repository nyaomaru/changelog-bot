import type { ProviderName } from '@/types/llm.js';
import type {
  ProviderRuntimeConfig,
  ProviderRuntimeConfigMap,
} from '@/types/config.js';
import type {
  ClassificationChange,
  ClassificationResult,
} from '@/types/changelog.js';
import type { Provider } from '@/types/provider.js';
import { fallbackCategoryAssignments } from '@/providers/classification.js';
import { providerFactory } from '@/utils/provider.js';
import { isString } from '@/utils/is.js';

function providerFromConfig(
  providerName: ProviderName,
  config: ProviderRuntimeConfig,
): Provider {
  const providerConfigs = {
    openai: config,
    anthropic: config,
    gemini: config,
  } satisfies ProviderRuntimeConfigMap;
  return providerFactory(providerName, providerConfigs);
}

/**
 * Classify canonical changes using the selected LLM provider.
 * Falls back to classifying all as `Chore` when no API key is present or on failure.
 * WHY: Provider-specific request details live in provider adapters; this helper
 * centralizes provider selection for callers that only have a provider name.
 * @param changes Stable IDs and normalized titles to classify.
 * @param provider Provider adapter or provider name.
 * @param config Runtime config required when passing a provider name.
 * @returns Reconciled ID-to-category assignments and diagnostics.
 */
export async function classifyChanges(
  changes: ClassificationChange[],
  provider: Provider | ProviderName,
  config?: ProviderRuntimeConfig,
): Promise<ClassificationResult> {
  if (!changes.length) return { assignments: {}, diagnostics: [] };
  if (!isString(provider)) {
    return provider.classifyChanges(changes);
  }
  if (!config) {
    return {
      assignments: fallbackCategoryAssignments(changes),
      diagnostics: [],
    };
  }
  const providerAdapter = providerFromConfig(provider, config);
  return providerAdapter.classifyChanges(changes);
}
