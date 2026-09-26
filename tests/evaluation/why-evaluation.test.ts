import { describe, expect, test } from '@jest/globals';

import { WHY_EVALUATION_CORPUS } from '@/evaluation/why-corpus.js';
import {
  evaluateJevConfidence,
  evaluateWhySelections,
} from '@/evaluation/why-evaluation.js';
import type { WhyEvaluationCase } from '@/evaluation/why-evaluation.js';

const CASES: WhyEvaluationCase[] = [
  {
    id: 'positive',
    item: {
      prNumber: 1,
      title: 'Fix lookup',
      itemText: 'Fix lookup',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'The lookup must use the merged pull request to avoid stale data.',
      ],
    },
    expectedSelectedCandidateIndex: 0,
  },
  {
    id: 'negative',
    item: {
      prNumber: 2,
      title: 'Refactor lookup',
      itemText: 'Refactor lookup',
      sectionTitle: 'Changed',
      trustScore: 7,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: ['Move lookup code into a shared module.'],
    },
    expectedSelectedCandidateIndex: null,
  },
];

describe('evaluateWhySelections', () => {
  test('keeps every corpus label tied to one valid candidate', () => {
    const prNumbers = new Set<number>();
    for (const evaluationCase of WHY_EVALUATION_CORPUS) {
      expect(prNumbers.has(evaluationCase.item.prNumber)).toBe(false);
      prNumbers.add(evaluationCase.item.prNumber);
      if (evaluationCase.expectedSelectedCandidateIndex !== null) {
        expect(
          evaluationCase.item.candidates[
            evaluationCase.expectedSelectedCandidateIndex
          ],
        ).toBeDefined();
      }
      for (const candidateIndex of evaluationCase.acceptableCandidateIndexes ??
        []) {
        expect(evaluationCase.item.candidates[candidateIndex]).toBeDefined();
      }
    }
  });

  test('reports acceptance and exact candidate-preservation metrics', () => {
    const metrics = evaluateWhySelections(CASES, [
      {
        prNumber: 1,
        why: 'The lookup must use the merged pull request to avoid stale data.',
        confidence: 'high',
      },
      {
        prNumber: 2,
        why: 'Move lookup code into a shared module.',
        confidence: 'medium',
      },
      { prNumber: 3, why: 'Unexpected', confidence: 'low' },
    ]);

    expect(metrics).toEqual({
      caseCount: 2,
      expectedSelections: 1,
      predictedSelections: 2,
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
      precision: 0.5,
      recall: 1,
      f1: 2 / 3,
      exactCandidatePreservations: 1,
      exactCandidatePreservationRate: 1,
      unexpectedSelections: 1,
      outcomes: [
        {
          id: 'positive',
          prNumber: 1,
          expectedSelectedCandidateIndex: 0,
          selected: true,
          selectedCandidateIndex: 0,
          preservesExpectedCandidate: true,
        },
        {
          id: 'negative',
          prNumber: 2,
          expectedSelectedCandidateIndex: null,
          selected: true,
          selectedCandidateIndex: 0,
          preservesExpectedCandidate: false,
        },
      ],
    });
  });

  test('reports Jev probability calibration proxies and threshold trade-offs', () => {
    const metrics = evaluateJevConfidence(CASES, [
      {
        prNumber: 1,
        questionType: 'noul',
        selectedOption: 'candidate_0',
        selectedCandidateIndex: 0,
        selectionProbability: 0.9,
        mappedConfidence: 'high',
        candidateProbabilities: [
          { candidateIndex: 0, probability: 0.9, relevanceProbability: 0.9 },
        ],
      },
      {
        prNumber: 2,
        questionType: 'noul',
        selectedOption: 'candidate_0',
        selectedCandidateIndex: 0,
        selectionProbability: 0.7,
        mappedConfidence: 'medium',
        candidateProbabilities: [
          { candidateIndex: 0, probability: 0.7, relevanceProbability: 0.7 },
        ],
      },
    ]);

    expect(metrics.brierScore).toBeCloseTo(0.25);
    expect({ ...metrics, brierScore: 0.25 }).toEqual({
      candidateCount: 2,
      brierScore: 0.25,
      meanPositiveProbability: 0.9,
      meanNegativeProbability: 0.7,
      thresholds: [
        {
          threshold: 0.5,
          truePositives: 1,
          falsePositives: 1,
          falseNegatives: 0,
          precision: 0.5,
          recall: 1,
          f1: 2 / 3,
        },
        {
          threshold: 0.6,
          truePositives: 1,
          falsePositives: 1,
          falseNegatives: 0,
          precision: 0.5,
          recall: 1,
          f1: 2 / 3,
        },
        {
          threshold: 0.8,
          truePositives: 1,
          falsePositives: 0,
          falseNegatives: 0,
          precision: 1,
          recall: 1,
          f1: 1,
        },
      ],
    });
  });
});
