import type { ProviderName } from '@/types/llm.js';
import { SECTION_ORDER } from '@/constants/changelog.js';
import { PROVIDER_ANTHROPIC } from '@/constants/provider.js';
import {
  ANTHROPIC_API,
  ANTHROPIC_VERSION,
  DEFAULT_ANTHROPIC_MODEL,
} from '@/constants/anthropic.js';
import { OPENAI_CHAT_API, DEFAULT_OPENAI_MODEL } from '@/constants/openai.js';
import { LLM_CLASSIFY_MAX_TOKENS } from '@/constants/prompt.js';

import type { CategoryMap } from '@/types/changelog.js';
import { isRecord, isString } from '@/utils/is.js';
import { postJson } from '@/utils/http.js';

/** Prompt payload sent to classification LLMs. */
type ClassificationPrompt = {
  /** Unique PR titles to categorize. */
  titles: string[];
  /** Ordered list of changelog categories to enforce. */
  categories: readonly string[];
};

/**
 * Extract the assistant text content from an Anthropic Messages API response.
 * @param json Raw JSON response.
 * @returns First message text or an empty string.
 */
function extractAnthropicResponse(json: unknown): string {
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

/**
 * Extract the assistant message content from an OpenAI Chat Completions response.
 * @param json Raw JSON response.
 * @returns First choice message content or a fallback `'{}'` string.
 */
function extractOpenAiResponse(json: unknown): string {
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

// NOTE: use shared postJson for consistent error handling and logging.

const SYSTEM_ANTHROPIC =
  'You are a changelog section classifier. Return JSON mapping each category to an array of titles. Use only the provided categories.';

const SYSTEM_OPENAI =
  'Classify each pull request title into one of the given categories. Return a JSON object with those categories as keys and arrays of titles as values.';

/** HTTP request configuration for a specific classification provider. */
type RequestConfig = {
  /** Endpoint URL for the provider. */
  url: string;
  /** Headers required to authorize the request. */
  headers: Record<string, string>;
  /** Serialized payload to POST to the provider. */
  payload: unknown;
  /** Extractor that pulls the raw JSON string from the provider response. */
  extract: (json: unknown) => string;
  /** Prefix applied to thrown errors for context. */
  errorPrefix: string;
};

/**
 * Build the request payload and metadata for Anthropic classification calls.
 * @param apiKey Anthropic API key to authorize the request.
 * @param prompt Serialized classification prompt payload.
 * @returns Configured request details for `postJson`.
 */
function buildAnthropicRequest(
  apiKey: string,
  prompt: ClassificationPrompt,
): RequestConfig {
  // Define a structured output schema via tools to force JSON.
  const properties: Record<string, unknown> = {};
  for (const cat of prompt.categories) {
    properties[cat] = { type: 'array', items: { type: 'string' } };
  }
  const payload = {
    model: DEFAULT_ANTHROPIC_MODEL,
    max_tokens: LLM_CLASSIFY_MAX_TOKENS,
    temperature: 0,
    system: SYSTEM_ANTHROPIC,
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
  return {
    url: ANTHROPIC_API,
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    payload,
    extract: extractAnthropicResponse,
    errorPrefix: 'Anthropic classify error',
  };
}

/**
 * Build the request payload and metadata for OpenAI classification calls.
 * @param apiKey OpenAI API key to authorize the request.
 * @param prompt Serialized classification prompt payload.
 * @returns Configured request details for `postJson`.
 */
function buildOpenAiRequest(
  apiKey: string,
  prompt: ClassificationPrompt,
): RequestConfig {
  const payload = {
    model: DEFAULT_OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_OPENAI },
      { role: 'user', content: JSON.stringify(prompt) },
    ],
    // Enforce strict JSON object output for robust parsing.
    response_format: { type: 'json_object' },
  } as const;
  return {
    url: OPENAI_CHAT_API,
    headers: { Authorization: `Bearer ${apiKey}` },
    payload,
    extract: extractOpenAiResponse,
    errorPrefix: 'OpenAI classify error',
  };
}

/**
 * Build a provider-specific classification request configuration.
 * @param provider Provider name.
 * @param apiKey API key for the chosen provider.
 * @param prompt Prompt payload containing titles and categories.
 * @returns URL, headers, payload, and an extractor for the response.
 */
function buildClassifyRequest(
  provider: ProviderName,
  apiKey: string,
  prompt: ClassificationPrompt,
): RequestConfig {
  return provider === PROVIDER_ANTHROPIC
    ? buildAnthropicRequest(apiKey, prompt)
    : buildOpenAiRequest(apiKey, prompt);
}

/**
 * Parse a JSON string into a CategoryMap when the shape matches expectations.
 * @param rawJson Serialized JSON string returned by the LLM.
 * @returns CategoryMap when valid, otherwise undefined.
 */
function parseCategoryMap(rawJson: string): CategoryMap | undefined {
  try {
    const parsed = JSON.parse(rawJson);
    if (!isRecord(parsed)) {
      return undefined;
    }

    const result: CategoryMap = {};
    for (const [category, titles] of Object.entries(parsed)) {
      if (Array.isArray(titles) && titles.every(isString)) {
        result[category] = titles.slice();
      }
    }

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Classify PR titles into changelog categories using the selected LLM provider.
 * Falls back to classifying all as `Chore` when no API key is present or on failure.
 * WHY: We prefer a deterministic changelog to a failure; graceful degradation keeps the CLI useful offline.
 * @param titles List of PR titles to classify.
 * @param provider Target LLM provider.
 * @returns Map of category -> titles.
 */
export async function classifyTitles(
  titles: string[],
  provider: ProviderName,
): Promise<CategoryMap> {
  if (!titles.length) return {};
  const prompt: ClassificationPrompt = { titles, categories: SECTION_ORDER };

  const apiKey =
    provider === PROVIDER_ANTHROPIC
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { Chore: titles };
  }

  try {
    const req = buildClassifyRequest(provider, apiKey, prompt);
    const json = await postJson<unknown>(
      req.url,
      req.payload,
      req.headers,
      req.errorPrefix,
    );
    const text = req.extract(json) || '{}';
    const parsed = parseCategoryMap(text);
    return parsed ?? { Chore: titles };
  } catch {
    return { Chore: titles };
  }
}
