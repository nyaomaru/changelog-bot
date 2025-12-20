import { OpenAIProvider } from '@/providers/openai.js';
import { AnthropicProvider } from '@/providers/anthropic.js';
import type { Provider } from '@/providers/types.js';
import type { ProviderName } from '@/types/llm.js';
import { PROVIDER_ANTHROPIC } from '@/constants/provider.js';

/**
 * Construct an LLM provider by name.
 * @param name Provider identifier.
 * @returns Instance implementing `Provider`.
 */
export function providerFactory(name: ProviderName): Provider {
  return name === PROVIDER_ANTHROPIC
    ? new AnthropicProvider()
    : new OpenAIProvider();
}
