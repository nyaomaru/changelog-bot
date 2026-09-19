import { z } from 'zod';

import type { TypeSafeRuntimeConfig } from '@/types/config.js';
import type { WhyExtractor } from '@/types/why-extractor.js';
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
const JEV_MIN_EXPLICIT_WHY_PROBABILITY = 0.5;
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

type JevNoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria: { true: string; false: string };
};

function candidateOption(index: number): string {
  return `candidate_${index}`;
}

function questionId(prNumber: number, candidateIndex: number): string {
  return `pr_${prNumber}_candidate_${candidateIndex}_is_explicit_why`;
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
 * @returns Requested delay, or undefined when the header is absent or invalid.
 */
function retryAfterDelay(retryAfterHeader: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  const normalizedHeader = retryAfterHeader.trim();
  if (/^\d+$/.test(normalizedHeader)) {
    return Number(normalizedHeader) * 1_000;
  }

  const retryAt = Date.parse(normalizedHeader);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
}

/**
 * Select PR-description evidence with Jev without asking it to generate prose.
 * @param config API key and model resolved for this run.
 */
export class JevWhyExtractor implements WhyExtractor {
  readonly name = 'jev';

  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: TypeSafeRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  /**
   * Score every source candidate for explicit rationale evidence, then select the best one.
   * @param input Preprocessed PR rationale candidates.
   * @returns WHY notes using only selected source candidates.
   */
  async extractWhyNotes(
    input: WhyExtractionInput,
  ): Promise<WhyExtractionOutput> {
    if (!this.apiKey) throw new Error('Missing TYPESAFE_API_KEY');

    const questions: Record<string, JevNoulQuestion> = {};
    const state = {
      task: 'Evaluate each supplied source candidate independently. A candidate passes only when it explicitly states why the pull request change was made; reject vague, implied, speculative, or implementation-only text.',
      language: input.language,
      pullRequests: input.items.map((item) => {
        for (const [index] of item.candidates.entries()) {
          questions[questionId(item.prNumber, index)] = {
            type: 'noul',
            instructions: `Does candidate ${candidateOption(index)} explicitly state why this pull request change was made?`,
            criteria: {
              true: 'The candidate directly states a concrete reason, motivation, problem, or intended outcome for the change.',
              false:
                'The candidate only describes what changed, implementation details, or an indirect/speculative reason.',
            },
          };
        }
        return {
          prNumber: item.prNumber,
          title: item.title,
          changelogItem: item.itemText,
          candidates: Object.fromEntries(
            item.candidates.map((candidate, index) => [
              candidateOption(index),
              candidate,
            ]),
          ),
        };
      }),
    };

    const response = await this.request({
      state,
      model: this.model,
      questions,
    });
    const parsedResponse = JevSystemOneResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      throw new Error('TypeSafe API returned an invalid Jev response');
    }

    const items = [];
    const selectionDiagnostics: WhySelectionDiagnostic[] = [];
    for (const item of input.items) {
      const candidateProbabilities = item.candidates.map(
        (_, candidateIndex) => {
          const answer =
            parsedResponse.data.answers[
              questionId(item.prNumber, candidateIndex)
            ];
          if (!answer) {
            throw new Error(
              `TypeSafe API omitted an answer for PR #${item.prNumber} candidate ${candidateIndex}`,
            );
          }
          return { candidateIndex, probability: answer.noul };
        },
      );
      const bestCandidate = candidateProbabilities.reduce((best, candidate) =>
        candidate.probability > best.probability ? candidate : best,
      );
      const selectedIndex = bestCandidate?.candidateIndex;
      const selectionProbability = bestCandidate?.probability ?? 0;
      const mappedConfidence = confidenceBucket(selectionProbability);
      const selectedCandidate =
        selectedIndex === undefined
          ? undefined
          : item.candidates[selectedIndex];
      const accepted =
        selectedCandidate !== undefined &&
        selectionProbability >= JEV_MIN_EXPLICIT_WHY_PROBABILITY;
      selectionDiagnostics.push({
        prNumber: item.prNumber,
        questionType: 'noul',
        selectedOption: accepted ? candidateOption(selectedIndex) : 'none',
        ...(accepted ? { selectedCandidateIndex: selectedIndex } : {}),
        selectionProbability,
        mappedConfidence,
        candidateProbabilities,
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
      const response = await fetch(TYPESAFE_SYSTEM_ONE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (response.ok) return response.json();

      const errorDetail = readErrorDetail(await response.text());
      if (
        !TYPESAFE_RETRYABLE_STATUS_CODES.has(response.status) ||
        attempt === TYPESAFE_MAX_ATTEMPTS - 1
      ) {
        throw new Error(
          `TypeSafe API request failed (${response.status})${errorDetail}`,
        );
      }
      // WHY: TypeSafe may extend throttling or capacity windows beyond our
      // local exponential backoff. Honoring its Retry-After hint avoids
      // consuming all attempts before that window expires.
      const delay =
        retryAfterDelay(response.headers.get('Retry-After')) ??
        retryDelay(attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    throw new Error('TypeSafe API request exhausted retries');
  }
}
