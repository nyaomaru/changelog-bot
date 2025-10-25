import type { LLMInput, LLMOutput, LLMProvider } from '@/types/llm.js';
import { outputSchema } from '@/utils/output-json-schema.js';
import { extractJsonObject } from '@/utils/json-extract.js';
import { postJson } from '@/utils/http.js';
import {
  ANTHROPIC_API,
  DEFAULT_ANTHROPIC_MODEL,
  ANTHROPIC_VERSION,
} from '@/constants/anthropic.js';
import {
  LLM_GENERATE_MAX_TOKENS,
  LLM_TEMPERATURE_DEFAULT,
} from '@/constants/prompt.js';
import { PROVIDER_ANTHROPIC } from '@/constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '@/constants/system-prompts.js';

const MODEL = DEFAULT_ANTHROPIC_MODEL;

export class AnthropicProvider implements LLMProvider {
  name = PROVIDER_ANTHROPIC;

  async generate(input: LLMInput): Promise<LLMOutput> {
    const payload: Record<string, unknown> = {
      model: MODEL,
      max_tokens: LLM_GENERATE_MAX_TOKENS,
      temperature: LLM_TEMPERATURE_DEFAULT,
      system: RELEASE_NOTES_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            ...input,
            requiredJsonSchema: outputSchema,
          }),
        },
      ],
    };

    /** Subset of Anthropic Messages response we inspect. */
    interface AnthropicResponse {
      /** Ordered list of message blocks returned by the model. */
      content?: Array<{
        /** Text block with the serialized JSON payload. */
        text?: string;
      }>;
    }

    const json = await postJson<AnthropicResponse>(
      ANTHROPIC_API,
      payload,
      {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      'Anthropic error'
    );
    const outputText = json.content?.[0]?.text ?? '';
    return extractJsonObject<LLMOutput>(outputText);
  }
}
