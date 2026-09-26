import { describe, expect, test } from '@jest/globals';

import { WHY_EVALUATION_CORPUS } from '@/evaluation/why-corpus.js';
import { evaluateWhySelections } from '@/evaluation/why-evaluation.js';
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
    }
  });

  test('reports acceptance and exact source-selection metrics', () => {
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
      exactSourceSelections: 1,
      exactSourceSelectionRate: 1,
      unexpectedSelections: 1,
      outcomes: [
        {
          id: 'positive',
          prNumber: 1,
          expectedSelectedCandidateIndex: 0,
          selected: true,
          selectedCandidateIndex: 0,
          matchesExpectedSource: true,
        },
        {
          id: 'negative',
          prNumber: 2,
          expectedSelectedCandidateIndex: null,
          selected: true,
          selectedCandidateIndex: 0,
          matchesExpectedSource: false,
        },
      ],
    });
  });
});
