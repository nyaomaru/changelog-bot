import type { LLMInput, LLMOutput } from '@/types/llm.js';
import type { ProviderRuntimeConfig } from '@/types/config.js';
import type { ClassifyTitlesOptions, Provider } from '@/types/provider.js';
import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';
import { outputSchema } from '@/utils/output-json-schema.js';
import { extractJsonObject } from '@/utils/json-extract.js';
import { postJson } from '@/utils/http.js';
import { OPENAI_CHAT_API, OPENAI_RESPONSES_API } from '@/constants/openai.js';
import {
  LLM_CLASSIFY_MAX_TOKENS,
  LLM_GENERATE_MAX_TOKENS,
  LLM_WHY_MAX_TOKENS,
  LLM_TEMPERATURE_DEFAULT,
  LLM_REASONING_EFFORT,
} from '@/constants/prompt.js';
import { isReasoningModel, isRecord, isString } from '@/utils/is.js';
import { PROVIDER_OPENAI } from '@/constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '@/constants/system-prompts.js';
import {
  buildClassificationPrompt,
  fallbackCategoryMap,
  parseCategoryMap,
} from '@/providers/classification.js';
import type { CategoryMap } from '@/types/changelog.js';
import {
  buildWhyExtractionPrompt,
  parseWhyExtractionOutput,
  WHY_EXTRACTION_SYSTEM_PROMPT,
} from '@/providers/why.js';

/** Subset of the OpenAI Responses API response payload we rely on. */
type OpenAIResponse = {
  /** Convenience mirror of the aggregated text output. */
  output_text?: string;
  /** Token-by-token content array returned by the API. */
  output?: Array<{
    /** Message content chunks emitted by the model. */
    content?: Array<{
      /** Text node containing JSON string output. */
      text?: string;
    }>;
  }>;
};

const SYSTEM_OPENAI_CLASSIFY =
  'Classify each pull request title into one of the given categories. Return a JSON object with those categories as keys and arrays of titles as values.';

/**
 * Extract the assistant message content from an OpenAI Chat Completions response.
 * @param json Raw JSON response.
 * @returns First choice message content or a fallback `'{}'` string.
 */
function extractOpenAiClassificationResponse(json: unknown): string {
  if (
    isRecord(json) &&
    Array.isArray(json.choices) &&
    isRecord(json.choices[0]) &&
    isRecord(json.choices[0].message) &&
    isString(json.choices[0].message.content)
  ) {
    return json.choices[0].message.content;
  }
  return '{}';
}

/**
 * Extract generated text from an OpenAI Responses API payload.
 * @param response Responses API payload.
 * @returns Aggregated output text or an empty string.
 */
function extractOpenAiResponseText(response: OpenAIResponse): string {
  return response.output_text || response.output?.[0]?.content?.[0]?.text || '';
}

/**
 * Build a Responses API payload with parameters compatible with the model.
 * @param modelName OpenAI model identifier.
 * @param systemPrompt System instruction for the request.
 * @param userPrompt Serialized user prompt.
 * @param maxOutputTokens Maximum output token budget.
 * @returns Responses API request payload.
 */
function buildOpenAiResponsePayload(
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: modelName,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_output_tokens: maxOutputTokens,
  };
  if (isReasoningModel(modelName)) {
    payload.reasoning = { effort: LLM_REASONING_EFFORT };
  } else {
    payload.temperature = LLM_TEMPERATURE_DEFAULT;
  }
  return payload;
}

export class OpenAIProvider implements Provider {
  name = PROVIDER_OPENAI;
  modelName: string;
  supports: Provider['supports'];

  private readonly apiKey?: string;

  constructor(config: ProviderRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.supports = {
      jsonMode: true,
      streaming: false,
      reasoning: isReasoningModel(this.modelName),
      maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
    } as const;
  }

  async generate(input: LLMInput): Promise<LLMOutput> {
    const payload = buildOpenAiResponsePayload(
      this.modelName,
      RELEASE_NOTES_SYSTEM_PROMPT,
      JSON.stringify({
        ...input,
        requiredJsonSchema: outputSchema,
      }),
      LLM_GENERATE_MAX_TOKENS,
    );

    const resp = await postJson<OpenAIResponse>(
      OPENAI_RESPONSES_API,
      payload,
      { Authorization: `Bearer ${this.apiKey ?? ''}` },
      'OpenAI error',
    );
    return extractJsonObject<LLMOutput>(extractOpenAiResponseText(resp));
  }

  async classifyTitles(
    titles: string[],
    options: ClassifyTitlesOptions = {},
  ): Promise<CategoryMap> {
    if (!titles.length) return {};
    if (!this.apiKey) return fallbackCategoryMap(titles);

    const prompt = buildClassificationPrompt(titles);

    try {
      let text: string;
      if (isReasoningModel(this.modelName)) {
        const payload = buildOpenAiResponsePayload(
          this.modelName,
          SYSTEM_OPENAI_CLASSIFY,
          JSON.stringify(prompt),
          LLM_CLASSIFY_MAX_TOKENS,
        );
        const response = await postJson<OpenAIResponse>(
          OPENAI_RESPONSES_API,
          payload,
          { Authorization: `Bearer ${this.apiKey}` },
          'OpenAI classify error',
        );
        text = extractOpenAiResponseText(response);
      } else {
        const payload = {
          model: this.modelName,
          max_tokens: LLM_CLASSIFY_MAX_TOKENS,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_OPENAI_CLASSIFY },
            { role: 'user', content: JSON.stringify(prompt) },
          ],
          // Enforce strict JSON object output for robust parsing.
          response_format: { type: 'json_object' },
        } as const;
        const response = await postJson<unknown>(
          OPENAI_CHAT_API,
          payload,
          { Authorization: `Bearer ${this.apiKey}` },
          'OpenAI classify error',
        );
        text = extractOpenAiClassificationResponse(response);
      }
      const categories = parseCategoryMap(text);
      if (!categories) {
        throw new Error('OpenAI classify output did not match schema');
      }
      return categories;
    } catch (err) {
      if (options.throwOnError) throw err;
      return fallbackCategoryMap(titles);
    }
  }

  async extractWhyNotes(
    input: WhyExtractionInput,
  ): Promise<WhyExtractionOutput> {
    if (!input.items.length) return { items: [] };

    const userPrompt = JSON.stringify(buildWhyExtractionPrompt(input));
    if (isReasoningModel(this.modelName)) {
      const payload = buildOpenAiResponsePayload(
        this.modelName,
        WHY_EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        LLM_WHY_MAX_TOKENS,
      );
      const response = await postJson<OpenAIResponse>(
        OPENAI_RESPONSES_API,
        payload,
        { Authorization: `Bearer ${this.apiKey ?? ''}` },
        'OpenAI WHY extraction error',
      );
      return parseWhyExtractionOutput(extractOpenAiResponseText(response));
    }

    const payload = {
      model: this.modelName,
      max_tokens: LLM_WHY_MAX_TOKENS,
      temperature: 0,
      messages: [
        { role: 'system', content: WHY_EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      response_format: { type: 'json_object' },
    } as const;

    const json = await postJson<unknown>(
      OPENAI_CHAT_API,
      payload,
      { Authorization: `Bearer ${this.apiKey ?? ''}` },
      'OpenAI WHY extraction error',
    );
    return parseWhyExtractionOutput(extractOpenAiClassificationResponse(json));
  }
}
