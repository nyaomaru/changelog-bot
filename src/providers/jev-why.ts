import { z } from 'zod';

import type { TypeSafeRuntimeConfig } from '@/types/config.js';
import type {
  WhyExtractionUsage,
  WhyExtractor,
} from '@/types/why-extractor.js';
import type {
  WhyConfidence,
  WhyExtractionInput,
  WhyExtractionOutput,
  WhySelectionDiagnostic,
} from '@/types/why.js';

const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_RETRYABLE_STATUS_CODES = new Set([429, 529]);
const TYPESAFE_MAX_ATTEMPTS = 3;
const TYPESAFE_RETRY_DELAY_MS = 250;
const TYPESAFE_MAX_RETRY_AFTER_DELAY_MS = 30_000;
const TYPESAFE_REQUEST_TIMEOUT_MS = 30_000;
const JEV_MIN_EXPLICIT_WHY_PROBABILITY = 0.5;
const JEV_MIN_CHANGE_RELEVANCE_PROBABILITY = 0.5;
const JEV_MEDIUM_CONFIDENCE_PROBABILITY = 0.6;
const JEV_HIGH_CONFIDENCE_PROBABILITY = 0.8;

const JevNoulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
});

const JevSystemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), JevNoulAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

type JevInstruction = string | Record<string, unknown> | unknown[] | null;

type JevNoulQuestion = {
  type: 'noul';
  instructions: JevInstruction;
  criteria: { true: string; false: string };
};

type TypeSafeResponse = {
  response: Response;
  readBody: () => Promise<string>;
  discardBody: () => void;
};

function candidateOption(index: number): string {
  return `candidate_${index}`;
}

function candidateId(prNumber: number, candidateIndex: number): string {
  return `pr_${prNumber}_candidate_${candidateIndex}`;
}

function explicitWhyQuestionId(candidate: string): string {
  return `${candidate}_is_explicit_why`;
}

function changeRelevanceQuestionId(candidate: string): string {
  return `${candidate}_matches_change`;
}

function confidenceBucket(probability: number): WhyConfidence {
  if (probability >= JEV_HIGH_CONFIDENCE_PROBABILITY) return 'high';
  if (probability >= JEV_MEDIUM_CONFIDENCE_PROBABILITY) return 'medium';
  return 'low';
}

function readErrorDetail(body: string): string {
  const normalizedBody = body.replace(/\s+/g, ' ').trim();
  return normalizedBody ? `: ${normalizedBody.slice(0, 300)}` : '';
}

function retryDelay(attempt: number): number {
  return TYPESAFE_RETRY_DELAY_MS * 2 ** attempt;
}

/**
 * Parses a TypeSafe Retry-After header into a delay in milliseconds.
 * @param retryAfterHeader Retry-After value returned by the API.
 * @returns Requested delay capped at 30 seconds, or undefined when the header is absent or invalid.
 */
function retryAfterDelay(retryAfterHeader: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  const normalizedHeader = retryAfterHeader.trim();
  let delay: number;
  if (/^\d+$/.test(normalizedHeader)) {
    delay = Number(normalizedHeader) * 1_000;
  } else {
    const retryAt = Date.parse(normalizedHeader);
    if (Number.isNaN(retryAt)) return undefined;
    delay = Math.max(0, retryAt - Date.now());
  }

  return Math.min(delay, TYPESAFE_MAX_RETRY_AFTER_DELAY_MS);
}

/**
 * Select PR-description evidence with Jev without asking it to generate prose.
 * @param config API key and model resolved for this run.
 */
export class JevWhyExtractor implements WhyExtractor {
  readonly name = 'jev';
  lastWhyExtractionUsage?: WhyExtractionUsage;

  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: TypeSafeRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  /**
   * Score each source candidate for explicit rationale and change relevance, then select the best one.
   * @param input Preprocessed PR rationale candidates.
   * @returns WHY notes using only selected source candidates.
   */
  async extractWhyNotes(
    input: WhyExtractionInput,
  ): Promise<WhyExtractionOutput> {
    if (!this.apiKey) throw new Error('Missing TYPESAFE_API_KEY');
    this.lastWhyExtractionUsage = undefined;

    const candidates: Record<
      string,
      {
        prNumber: number;
        prTitle: string;
        changelogItem: string;
        text: string;
      }
    > = {};
    const questions: Record<string, JevNoulQuestion> = {};
    const state = {
      task: 'Evaluate each supplied source candidate independently. A candidate passes only when it explicitly states why its changelog change was made and that reason applies to the identified changelog change; reject vague, implied, speculative, implementation-only, or unrelated text.',
      language: input.language,
      candidates,
    };
    for (const item of input.items) {
      for (const [index, text] of item.candidates.entries()) {
        const id = candidateId(item.prNumber, index);
        candidates[id] = {
          prNumber: item.prNumber,
          prTitle: item.title,
          changelogItem: item.itemText,
          text,
        };
        questions[explicitWhyQuestionId(id)] = {
          type: 'noul',
          instructions: {
            question:
              'Does the target candidate explicitly state why this changelog change was made?',
            target: `candidates.${id}`,
          },
          criteria: {
            true: 'The candidate directly states a concrete reason, motivation, problem, or intended outcome for the change.',
            false:
              'The candidate only describes what changed, implementation details, or an indirect/speculative reason.',
          },
        };
        questions[changeRelevanceQuestionId(id)] = {
          type: 'noul',
          instructions: {
            question:
              'Does the target candidate state a reason that applies to the identified changelog change?',
            target: `candidates.${id}`,
          },
          criteria: {
            true: 'The stated reason, motivation, problem, or intended outcome directly explains the PR title and changelog item.',
            false:
              'The candidate discusses a reason for another change, project, document, or workflow, even if that reason is explicit.',
          },
        };
      }
    }

    const response = await this.request({
      state,
      model: this.model,
      questions,
    });
    const parsedResponse = JevSystemOneResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      throw new Error('TypeSafe API returned an invalid Jev response');
    }
    this.lastWhyExtractionUsage = {
      inputTokens: parsedResponse.data.usage.input_tokens,
      outputTokens: parsedResponse.data.usage.output_tokens,
    };

    const items = [];
    const selectionDiagnostics: WhySelectionDiagnostic[] = [];
    for (const item of input.items) {
      const candidateProbabilities = item.candidates.map(
        (_, candidateIndex) => {
          const explicitWhyAnswer =
            parsedResponse.data.answers[
              explicitWhyQuestionId(candidateId(item.prNumber, candidateIndex))
            ];
          const changeRelevanceAnswer =
            parsedResponse.data.answers[
              changeRelevanceQuestionId(
                candidateId(item.prNumber, candidateIndex),
              )
            ];
          if (!explicitWhyAnswer || !changeRelevanceAnswer) {
            throw new Error(
              `TypeSafe API omitted an answer for PR #${item.prNumber} candidate ${candidateIndex}`,
            );
          }
          return {
            candidateIndex,
            probability: explicitWhyAnswer.noul,
            relevanceProbability: changeRelevanceAnswer.noul,
            combinedProbability: Math.min(
              explicitWhyAnswer.noul,
              changeRelevanceAnswer.noul,
            ),
          };
        },
      );
      const bestCandidate = candidateProbabilities.reduce((best, candidate) =>
        candidate.combinedProbability > best.combinedProbability
          ? candidate
          : best,
      );
      const selectedIndex = bestCandidate?.candidateIndex;
      const selectionProbability = bestCandidate?.combinedProbability ?? 0;
      const mappedConfidence = confidenceBucket(selectionProbability);
      const selectedCandidate =
        selectedIndex === undefined
          ? undefined
          : item.candidates[selectedIndex];
      const accepted =
        selectedCandidate !== undefined &&
        bestCandidate.probability >= JEV_MIN_EXPLICIT_WHY_PROBABILITY &&
        bestCandidate.relevanceProbability >=
          JEV_MIN_CHANGE_RELEVANCE_PROBABILITY;
      selectionDiagnostics.push({
        prNumber: item.prNumber,
        questionType: 'noul',
        selectedOption: accepted ? candidateOption(selectedIndex) : 'none',
        ...(accepted ? { selectedCandidateIndex: selectedIndex } : {}),
        selectionProbability,
        mappedConfidence,
        candidateProbabilities: candidateProbabilities.map(
          ({ candidateIndex, probability, relevanceProbability }) => ({
            candidateIndex,
            probability,
            relevanceProbability,
          }),
        ),
      });
      if (!accepted) continue;
      items.push({
        prNumber: item.prNumber,
        why: selectedCandidate,
        confidence: mappedConfidence,
      });
    }

    return { items, selectionDiagnostics };
  }

  private async request(body: unknown): Promise<unknown> {
    for (let attempt = 0; attempt < TYPESAFE_MAX_ATTEMPTS; attempt += 1) {
      const typeSafeResponse = await this.fetchWithTimeout(body);
      if (typeSafeResponse.response.ok) {
        return JSON.parse(await typeSafeResponse.readBody());
      }

      const retryable = TYPESAFE_RETRYABLE_STATUS_CODES.has(
        typeSafeResponse.response.status,
      );
      if (!retryable || attempt === TYPESAFE_MAX_ATTEMPTS - 1) {
        const errorDetail = readErrorDetail(await typeSafeResponse.readBody());
        throw new Error(
          `TypeSafe API request failed (${typeSafeResponse.response.status})${errorDetail}`,
        );
      }
      // WHY: TypeSafe may extend throttling or capacity windows beyond our
      // local exponential backoff. Decide to retry from headers before
      // consuming a possibly stalled error body, then discard it so an
      // upstream response cannot keep a workflow running until its timeout.
      const delay =
        retryAfterDelay(typeSafeResponse.response.headers.get('Retry-After')) ??
        retryDelay(attempt);
      typeSafeResponse.discardBody();
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    throw new Error('TypeSafe API request exhausted retries');
  }

  private async fetchWithTimeout(body: unknown): Promise<TypeSafeResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TYPESAFE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TYPESAFE_SYSTEM_ONE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return {
        response,
        readBody: async () => {
          try {
            return await response.text();
          } catch (error) {
            if (timedOut) {
              throw new Error(
                `TypeSafe API request timed out after ${TYPESAFE_REQUEST_TIMEOUT_MS / 1_000} seconds`,
                { cause: error },
              );
            }
            throw error;
          } finally {
            clearTimeout(timeout);
          }
        },
        discardBody: () => {
          controller.abort();
          clearTimeout(timeout);
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      if (timedOut) {
        throw new Error(
          `TypeSafe API request timed out after ${TYPESAFE_REQUEST_TIMEOUT_MS / 1_000} seconds`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}
