import { z } from 'zod';

import type { TypeSafeRuntimeConfig } from '@/types/config.js';
import type { WhyExtractor } from '@/types/why-extractor.js';
import type {
  WhyConfidence,
  WhyExtractionInput,
  WhyExtractionOutput,
} from '@/types/why.js';

const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_RETRYABLE_STATUS_CODES = new Set([429, 529]);
const TYPESAFE_MAX_ATTEMPTS = 3;
const TYPESAFE_RETRY_DELAY_MS = 250;

const JevChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1),
});

const JevSystemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), JevChoiceAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

type JevChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
};

function candidateOption(index: number): string {
  return `candidate_${index}`;
}

function questionId(prNumber: number): string {
  return `pr_${prNumber}_why_candidate`;
}

function confidenceBucket(confidence: number): WhyConfidence {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
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
   * Choose one explicit source candidate (or none) for every eligible PR.
   * @param input Preprocessed PR rationale candidates.
   * @returns WHY notes using only selected source candidates.
   */
  async extractWhyNotes(
    input: WhyExtractionInput,
  ): Promise<WhyExtractionOutput> {
    if (!this.apiKey) throw new Error('Missing TYPESAFE_API_KEY');

    const questions: Record<string, JevChoiceQuestion> = {};
    const state = {
      task: 'Select one source candidate that explicitly states why the pull request change was made. Select none when the reason is unclear, implied, speculative, or only describes implementation details.',
      language: input.language,
      pullRequests: input.items.map((item) => {
        const criteria: Record<string, string | null> = {
          none: 'No supplied candidate explicitly states a trustworthy reason.',
        };
        for (const [index, candidate] of item.candidates.entries()) {
          criteria[candidateOption(index)] = candidate;
        }
        questions[questionId(item.prNumber)] = {
          type: 'choice',
          instructions:
            'Which supplied candidate is an explicit, evidence-backed WHY note for this pull request? Select none unless one candidate directly states the reason for the change.',
          criteria,
        };
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
    const selectionDiagnostics = [];
    for (const item of input.items) {
      const answer = parsedResponse.data.answers[questionId(item.prNumber)];
      if (!answer) {
        throw new Error(
          `TypeSafe API omitted an answer for PR #${item.prNumber}`,
        );
      }
      const selectionProbability = answer.probabilities[answer.choice] ?? 0;
      const certainty = Math.min(answer.confidence, selectionProbability);
      const mappedConfidence = confidenceBucket(certainty);
      if (answer.choice === 'none') {
        selectionDiagnostics.push({
          prNumber: item.prNumber,
          selectedOption: answer.choice,
          selectionProbability,
          confidence: answer.confidence,
          mappedConfidence,
        });
        continue;
      }

      const selectedIndex = Number.parseInt(
        answer.choice.replace(/^candidate_/, ''),
        10,
      );
      const selectedCandidate = item.candidates[selectedIndex];
      if (!/^candidate_\d+$/.test(answer.choice) || !selectedCandidate) {
        throw new Error(
          `TypeSafe API returned an unknown candidate for PR #${item.prNumber}`,
        );
      }

      // WHY: A confident distribution is not enough when the winning option is
      // itself unlikely, so preserve the weaker of the two signals.
      selectionDiagnostics.push({
        prNumber: item.prNumber,
        selectedOption: answer.choice,
        selectedCandidateIndex: selectedIndex,
        selectionProbability,
        confidence: answer.confidence,
        mappedConfidence,
      });
      items.push({
        prNumber: item.prNumber,
        why: selectedCandidate,
        confidence: confidenceBucket(certainty),
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
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelay(attempt));
      });
    }

    throw new Error('TypeSafe API request exhausted retries');
  }
}
