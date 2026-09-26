import type {
  WhyExtractionItem,
  WhyExtractionResult,
  WhySelectionDiagnostic,
} from '@/types/why.js';

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
  /** Other candidate indexes that are also valid WHY evidence for this case. */
  acceptableCandidateIndexes?: readonly number[];
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

/** Selection quality after applying one candidate probability threshold. */
export type WhyThresholdMetrics = {
  /** Probability required to accept a candidate. */
  threshold: number;
  /** Correctly accepted PR candidate sets. */
  truePositives: number;
  /** Incorrectly accepted PR candidate sets. */
  falsePositives: number;
  /** Positive PR candidate sets omitted at this threshold. */
  falseNegatives: number;
  /** Fraction of accepted candidate sets that should be accepted. */
  precision: number | null;
  /** Fraction of positive candidate sets accepted at this threshold. */
  recall: number | null;
  /** Harmonic mean of precision and recall. */
  f1: number | null;
};

/** Candidate-probability quality and threshold trade-offs for a Jev run. */
export type JevConfidenceMetrics = {
  /** Number of labeled source candidates evaluated by Jev. */
  candidateCount: number;
  /** Mean squared error between combined probability and candidate labels. */
  brierScore: number | null;
  /** Mean combined probability for accepted source candidates. */
  meanPositiveProbability: number | null;
  /** Mean combined probability for rejected source candidates. */
  meanNegativeProbability: number | null;
  /** Acceptance metrics at the experimental probability thresholds. */
  thresholds: WhyThresholdMetrics[];
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function expectedCandidateIndexes(
  evaluationCase: WhyEvaluationCase,
): readonly number[] {
  if (evaluationCase.acceptableCandidateIndexes) {
    return evaluationCase.acceptableCandidateIndexes;
  }
  return evaluationCase.expectedSelectedCandidateIndex === null
    ? []
    : [evaluationCase.expectedSelectedCandidateIndex];
}

function thresholdMetrics(
  cases: readonly WhyEvaluationCase[],
  diagnosticsByPrNumber: ReadonlyMap<number, WhySelectionDiagnostic>,
  threshold: number,
): WhyThresholdMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (const evaluationCase of cases) {
    const diagnostic = diagnosticsByPrNumber.get(evaluationCase.item.prNumber);
    if (!diagnostic) {
      throw new Error(
        `Jev confidence evaluation is missing diagnostics for PR #${evaluationCase.item.prNumber}`,
      );
    }
    const expectedSelection =
      expectedCandidateIndexes(evaluationCase).length > 0;
    const selected = diagnostic.selectionProbability >= threshold;
    if (expectedSelection && selected) truePositives += 1;
    if (!expectedSelection && selected) falsePositives += 1;
    if (expectedSelection && !selected) falseNegatives += 1;
  }
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  return {
    threshold,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1:
      precision === null || recall === null || precision + recall === 0
        ? null
        : (2 * precision * recall) / (precision + recall),
  };
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
    const expectedIndexes = expectedCandidateIndexes(evaluationCase);
    const expectedSelection = expectedIndexes.length > 0;
    const predicted = outputByPrNumber.get(evaluationCase.item.prNumber);
    const predictedSelection = predicted !== undefined;
    const selectedCandidateIndex = predicted
      ? evaluationCase.item.candidates.indexOf(predicted.why)
      : -1;
    const preservesExpectedCandidate =
      selectedCandidateIndex !== -1 &&
      expectedIndexes.includes(selectedCandidateIndex);
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

/**
 * Evaluate Jev's raw candidate probabilities independently of the active threshold.
 * @param cases Labeled candidate sets sent to Jev.
 * @param diagnostics Jev decision diagnostics returned for the same candidate sets.
 * @returns Probability calibration proxy and acceptance trade-offs.
 */
export function evaluateJevConfidence(
  cases: readonly WhyEvaluationCase[],
  diagnostics: readonly WhySelectionDiagnostic[],
): JevConfidenceMetrics {
  const diagnosticsByPrNumber = new Map<number, WhySelectionDiagnostic>();
  for (const diagnostic of diagnostics) {
    diagnosticsByPrNumber.set(diagnostic.prNumber, diagnostic);
  }

  const positiveProbabilities: number[] = [];
  const negativeProbabilities: number[] = [];
  let squaredErrorSum = 0;
  let candidateCount = 0;
  for (const evaluationCase of cases) {
    const diagnostic = diagnosticsByPrNumber.get(evaluationCase.item.prNumber);
    if (!diagnostic) {
      throw new Error(
        `Jev confidence evaluation is missing diagnostics for PR #${evaluationCase.item.prNumber}`,
      );
    }
    const expectedIndexes = expectedCandidateIndexes(evaluationCase);
    for (const candidate of diagnostic.candidateProbabilities) {
      const probability = Math.min(
        candidate.probability,
        candidate.relevanceProbability ?? candidate.probability,
      );
      const expected = expectedIndexes.includes(candidate.candidateIndex)
        ? 1
        : 0;
      squaredErrorSum += (probability - expected) ** 2;
      candidateCount += 1;
      if (expected === 1) positiveProbabilities.push(probability);
      else negativeProbabilities.push(probability);
    }
  }

  const mean = (values: readonly number[]): number | null =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    candidateCount,
    brierScore: ratio(squaredErrorSum, candidateCount),
    meanPositiveProbability: mean(positiveProbabilities),
    meanNegativeProbability: mean(negativeProbabilities),
    thresholds: [0.5, 0.6, 0.8].map((threshold) =>
      thresholdMetrics(cases, diagnosticsByPrNumber, threshold),
    ),
  };
}
