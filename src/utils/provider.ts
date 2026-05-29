import { OpenAIProvider } from '@/providers/openai.js';
import { AnthropicProvider } from '@/providers/anthropic.js';
import { GeminiProvider } from '@/providers/gemini.js';
import type {
  ProviderRuntimeConfig,
  ProviderRuntimeConfigMap,
} from '@/types/config.js';
import type { Provider } from '@/types/provider.js';
import type { ProviderName } from '@/types/llm.js';

type ProviderConstructor = new (config: ProviderRuntimeConfig) => Provider;

const PROVIDER_REGISTRY: Record<ProviderName, ProviderConstructor> = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  gemini: GeminiProvider,
};

/**
 * Construct an LLM provider by name.
 * @param name Provider identifier.
 * @param config Provider runtime configuration map.
 * @returns Instance implementing `Provider`.
 */
export function providerFactory(
  name: ProviderName,
  config: ProviderRuntimeConfigMap,
): Provider {
  const ProviderAdapter = PROVIDER_REGISTRY[name];
  return new ProviderAdapter(config[name]);
}
