import type { WhyExtractionItem, WhyExtractionResult } from '@/types/why.js';

/** One labeled candidate set used to compare WHY extractors. */
export type WhyEvaluationCase = {
  /** Stable identifier for this labeled example. */
  id: string;
  /** Pull request from which the example was taken, when applicable. */
  sourcePullRequest?: number;
  /** Candidate material supplied to every evaluated extractor. */
  item: WhyExtractionItem;
  /** Expected accepted candidate index, or null when no WHY note is valid. */
  expectedSelectedCandidateIndex: number | null;
};

/** Precision, recall, and source-selection metrics for one extractor run. */
export type WhyEvaluationMetrics = {
  /** Number of labeled PR candidate sets. */
  caseCount: number;
  /** Number of cases that should produce a WHY note. */
  expectedSelections: number;
  /** Number of WHY notes returned by the extractor for corpus cases. */
  predictedSelections: number;
  /** Correctly accepted cases. */
  truePositives: number;
  /** Incorrectly accepted cases. */
  falsePositives: number;
  /** Correct cases omitted by the extractor. */
  falseNegatives: number;
  /** Fraction of returned notes that belong to a labeled positive case. */
  precision: number | null;
  /** Fraction of labeled positive cases that produced a note. */
  recall: number | null;
  /** Harmonic mean of precision and recall. */
  f1: number | null;
  /** Positive cases whose returned text preserves the expected source candidate. */
  exactCandidatePreservations: number;
  /** Source-candidate preservation rate among labeled positive cases. */
  exactCandidatePreservationRate: number | null;
  /** Returned notes whose PR number is not part of the corpus. */
  unexpectedSelections: number;
  /** Per-case decisions used to diagnose metric changes. */
  outcomes: WhyEvaluationOutcome[];
};

/** Expected and observed result for one labeled PR candidate set. */
export type WhyEvaluationOutcome = {
  /** Stable corpus case identifier. */
  id: string;
  /** PR number supplied to the extractor. */
  prNumber: number;
  /** Labeled candidate index, or null when no candidate should be selected. */
  expectedSelectedCandidateIndex: number | null;
  /** Whether the extractor returned a WHY note for this PR. */
  selected: boolean;
  /** Index of an exactly preserved source candidate, when one was returned. */
  selectedCandidateIndex: number | null;
  /** Whether the returned note preserves the expected source candidate. */
  preservesExpectedCandidate: boolean;
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Score extractor output against corpus labels without interpreting generated prose.
 * @param cases Labeled candidate sets sent to the extractor.
 * @param output Returned WHY notes.
 * @returns Acceptance and exact-source-selection metrics.
 */
export function evaluateWhySelections(
  cases: readonly WhyEvaluationCase[],
  output: readonly WhyExtractionResult[],
): WhyEvaluationMetrics {
  const casesByPrNumber = new Map<number, WhyEvaluationCase>();
  for (const evaluationCase of cases) {
    if (casesByPrNumber.has(evaluationCase.item.prNumber)) {
      throw new Error(
        `WHY evaluation corpus contains duplicate PR #${evaluationCase.item.prNumber}`,
      );
    }
    casesByPrNumber.set(evaluationCase.item.prNumber, evaluationCase);
  }

  const outputByPrNumber = new Map<number, WhyExtractionResult>();
  let unexpectedSelections = 0;
  for (const note of output) {
    if (!casesByPrNumber.has(note.prNumber)) {
      unexpectedSelections += 1;
      continue;
    }
    outputByPrNumber.set(note.prNumber, note);
  }

  let expectedSelections = 0;
  let predictedSelections = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let exactCandidatePreservations = 0;
  const outcomes: WhyEvaluationOutcome[] = [];
  for (const evaluationCase of cases) {
    const expectedIndex = evaluationCase.expectedSelectedCandidateIndex;
    const expectedSelection = expectedIndex !== null;
    const predicted = outputByPrNumber.get(evaluationCase.item.prNumber);
    const predictedSelection = predicted !== undefined;
    const selectedCandidateIndex = predicted
      ? evaluationCase.item.candidates.indexOf(predicted.why)
      : -1;
    const preservesExpectedCandidate =
      expectedIndex !== null && selectedCandidateIndex === expectedIndex;
    outcomes.push({
      id: evaluationCase.id,
      prNumber: evaluationCase.item.prNumber,
      expectedSelectedCandidateIndex: expectedIndex,
      selected: predictedSelection,
      selectedCandidateIndex:
        selectedCandidateIndex === -1 ? null : selectedCandidateIndex,
      preservesExpectedCandidate,
    });
    if (expectedSelection) expectedSelections += 1;
    if (predictedSelection) predictedSelections += 1;

    if (expectedSelection && predictedSelection) {
      truePositives += 1;
      if (preservesExpectedCandidate) {
        exactCandidatePreservations += 1;
      }
      continue;
    }
    if (expectedSelection) {
      falseNegatives += 1;
      continue;
    }
    if (predictedSelection) falsePositives += 1;
  }

  const precision = ratio(truePositives, predictedSelections);
  const recall = ratio(truePositives, expectedSelections);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  return {
    caseCount: cases.length,
    expectedSelections,
    predictedSelections,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    exactCandidatePreservations,
    exactCandidatePreservationRate: ratio(
      exactCandidatePreservations,
      expectedSelections,
    ),
    unexpectedSelections,
    outcomes,
  };
}
