import type { LLMInput, LLMOutput } from '@/types/llm.js';
import type { ProviderRuntimeConfig } from '@/types/config.js';
import type { Provider } from '@/types/provider.js';
import { outputSchema } from '@/utils/output-json-schema.js';
import { extractJsonObject } from '@/utils/json-extract.js';
import { postJson } from '@/utils/http.js';
import { ANTHROPIC_API, ANTHROPIC_VERSION } from '@/constants/anthropic.js';
import {
  LLM_CLASSIFY_MAX_TOKENS,
  LLM_GENERATE_MAX_TOKENS,
  LLM_TEMPERATURE_DEFAULT,
} from '@/constants/prompt.js';
import { PROVIDER_ANTHROPIC } from '@/constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '@/constants/system-prompts.js';
import {
  buildClassificationPrompt,
  fallbackCategoryMap,
  parseCategoryMap,
} from '@/providers/classification.js';
import { isRecord, isString } from '@/utils/is.js';
import type { CategoryMap } from '@/types/changelog.js';

const SYSTEM_ANTHROPIC_CLASSIFY =
  'You are a changelog section classifier. Return JSON mapping each category to an array of titles. Use only the provided categories.';

/**
 * Extract the assistant text content from an Anthropic Messages API response.
 * @param json Raw JSON response.
 * @returns First message text or an empty string.
 */
function extractAnthropicClassificationResponse(json: unknown): string {
  // Prefer structured tool_use output when present.
  if (isRecord(json) && Array.isArray(json.content)) {
    const first = json.content[0];
    // tool_use content: { type: 'tool_use', name, input: {...} }
    if (isRecord(first) && first.type === 'tool_use' && isRecord(first.input)) {
      // Note: If first.input contains circular references, JSON.stringify will throw.
      // If this is a concern, handle or document it explicitly.
      return JSON.stringify(first.input);
    }
    // Fallback to plain text when model did not use tools/structured outputs.
    if (isRecord(first) && isString(first.text)) {
      return first.text;
    }
  }
  return '';
}

export class AnthropicProvider implements Provider {
  name = PROVIDER_ANTHROPIC;
  modelName: string;
  supports: Provider['supports'];

  private readonly apiKey?: string;

  constructor(config: ProviderRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.supports = {
      jsonMode: true,
      streaming: false,
      reasoning: false,
      maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
    } as const;
  }

  async generate(input: LLMInput): Promise<LLMOutput> {
    const payload: Record<string, unknown> = {
      model: this.modelName,
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
        'x-api-key': this.apiKey ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      'Anthropic error',
    );
    const outputText = json.content?.[0]?.text ?? '';
    return extractJsonObject<LLMOutput>(outputText);
  }

  async classifyTitles(titles: string[]): Promise<CategoryMap> {
    if (!titles.length) return {};
    if (!this.apiKey) return fallbackCategoryMap(titles);

    const prompt = buildClassificationPrompt(titles);
    const properties: Record<string, unknown> = {};
    for (const category of prompt.categories) {
      properties[category] = { type: 'array', items: { type: 'string' } };
    }

    const payload = {
      model: this.modelName,
      max_tokens: LLM_CLASSIFY_MAX_TOKENS,
      temperature: 0,
      system: SYSTEM_ANTHROPIC_CLASSIFY,
      messages: [{ role: 'user', content: JSON.stringify(prompt) }],
      tools: [
        {
          name: 'return_categories',
          description:
            'Return a JSON object mapping each category to an array of titles.',
          input_schema: {
            type: 'object',
            properties,
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_categories' },
    } as const;

    try {
      const json = await postJson<unknown>(
        ANTHROPIC_API,
        payload,
        {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        'Anthropic classify error',
      );
      const text = extractAnthropicClassificationResponse(json) || '{}';
      return parseCategoryMap(text) ?? fallbackCategoryMap(titles);
    } catch {
      return fallbackCategoryMap(titles);
    }
  }
}
