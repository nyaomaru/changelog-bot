import type { LLMInput, LLMOutput } from '@/types/llm.js';
import type { ProviderRuntimeConfig } from '@/types/config.js';
import type { Provider } from '@/types/provider.js';
import type { CategoryMap } from '@/types/changelog.js';
import { outputSchema } from '@/utils/output-json-schema.js';
import { extractJsonObject } from '@/utils/json-extract.js';
import { postJson } from '@/utils/http.js';
import { GEMINI_API_BASE } from '@/constants/gemini.js';
import {
  LLM_CLASSIFY_MAX_TOKENS,
  LLM_GENERATE_MAX_TOKENS,
  LLM_TEMPERATURE_DEFAULT,
} from '@/constants/prompt.js';
import { PROVIDER_GEMINI } from '@/constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '@/constants/system-prompts.js';
import {
  buildClassificationPrompt,
  fallbackCategoryMap,
  parseCategoryMap,
} from '@/providers/classification.js';

const SYSTEM_GEMINI_CLASSIFY =
  'Classify each pull request title into one of the given categories. Return a JSON object with those categories as keys and arrays of titles as values.';

/** Subset of the Gemini generateContent response payload we rely on. */
type GeminiResponse = {
  /** Candidate responses returned by the model. */
  candidates?: Array<{
    /** Generated content blocks. */
    content?: {
      /** Text parts emitted by the model. */
      parts?: Array<{
        /** Text node containing JSON string output. */
        text?: string;
      }>;
    };
  }>;
};

/**
 * Build the Gemini generateContent endpoint URL for a model.
 * @param modelName Gemini model identifier.
 * @returns Full REST endpoint URL.
 */
function buildGeminiGenerateUrl(modelName: string): string {
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(
    modelName,
  )}:generateContent`;
}

/**
 * Extract concatenated text from the first Gemini candidate.
 * @param response Gemini generateContent response.
 * @returns Candidate text or an empty string.
 */
function extractGeminiText(response: GeminiResponse): string {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('') ?? ''
  );
}

/** Gemini provider adapter backed by the Google AI generateContent REST API. */
export class GeminiProvider implements Provider {
  name = PROVIDER_GEMINI;
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
    const payload = {
      systemInstruction: {
        parts: [{ text: RELEASE_NOTES_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                ...input,
                requiredJsonSchema: outputSchema,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
        temperature: LLM_TEMPERATURE_DEFAULT,
        responseMimeType: 'application/json',
        responseJsonSchema: outputSchema,
      },
    } as const;

    const response = await postJson<GeminiResponse>(
      buildGeminiGenerateUrl(this.modelName),
      payload,
      { 'x-goog-api-key': this.apiKey ?? '' },
      'Gemini error',
    );
    return extractJsonObject<LLMOutput>(extractGeminiText(response));
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
      systemInstruction: {
        parts: [{ text: SYSTEM_GEMINI_CLASSIFY }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(prompt) }],
        },
      ],
      generationConfig: {
        maxOutputTokens: LLM_CLASSIFY_MAX_TOKENS,
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties,
          required: [...prompt.categories],
          additionalProperties: false,
        },
      },
    } as const;

    try {
      const response = await postJson<GeminiResponse>(
        buildGeminiGenerateUrl(this.modelName),
        payload,
        { 'x-goog-api-key': this.apiKey },
        'Gemini classify error',
      );
      return (
        parseCategoryMap(extractGeminiText(response)) ??
        fallbackCategoryMap(titles)
      );
    } catch {
      return fallbackCategoryMap(titles);
    }
  }
}
