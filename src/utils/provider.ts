import { OpenAIProvider } from '@/providers/openai.js';
import { AnthropicProvider } from '@/providers/anthropic.js';
import type { ProviderRuntimeConfigMap } from '@/types/config.js';
import type { Provider } from '@/types/provider.js';
import type { ProviderName } from '@/types/llm.js';
import { PROVIDER_ANTHROPIC } from '@/constants/provider.js';

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
  return name === PROVIDER_ANTHROPIC
    ? new AnthropicProvider(config[PROVIDER_ANTHROPIC])
    : new OpenAIProvider(config[name]);
}
