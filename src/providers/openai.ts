import type { LLMInput, LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import { outputSchema } from '@/utils/output-json-schema.js';
import { extractJsonObject } from '@/utils/json-extract.js';
import { postJson } from '@/utils/http.js';
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_RESPONSES_API,
} from '@/constants/openai.js';
import {
  LLM_GENERATE_MAX_TOKENS,
  LLM_TEMPERATURE_DEFAULT,
  LLM_REASONING_EFFORT,
} from '@/constants/prompt.js';
import { isReasoningModel } from '@/utils/is.js';
import { PROVIDER_OPENAI } from '@/constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '@/constants/system-prompts.js';

const MODEL = DEFAULT_OPENAI_MODEL;

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

export class OpenAIProvider implements Provider {
  name = PROVIDER_OPENAI;
  modelName = MODEL;
  supports = {
    jsonMode: true,
    streaming: false,
    reasoning: isReasoningModel(MODEL),
    maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
  } as const;

  async generate(input: LLMInput): Promise<LLMOutput> {
    const base: Record<string, unknown> = {
      model: MODEL,
      input: [
        { role: 'system', content: RELEASE_NOTES_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            ...input,
            requiredJsonSchema: outputSchema,
          }),
        },
      ],
      max_output_tokens: LLM_GENERATE_MAX_TOKENS,
    };
    if (!isReasoningModel(MODEL)) {
      base.temperature = LLM_TEMPERATURE_DEFAULT;
    } else {
      base.reasoning = { effort: LLM_REASONING_EFFORT };
    }

    const resp = await postJson<OpenAIResponse>(
      OPENAI_RESPONSES_API,
      base,
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      'OpenAI error'
    );
    const outputText =
      resp.output_text || resp.output?.[0]?.content?.[0]?.text || '';
    return extractJsonObject<LLMOutput>(outputText);
  }
}
