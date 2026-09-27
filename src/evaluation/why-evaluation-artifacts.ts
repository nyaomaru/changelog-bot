import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  JevConfidenceMetrics,
  WhyEvaluationCase,
  WhyEvaluationMetrics,
} from '@/evaluation/why-evaluation.js';
import type {
  WhyExtractionDiagnostics,
  WhyExtractionUsage,
} from '@/types/why-extractor.js';

const PERCENTILE_95_RATIO = 0.95;
const CORPUS_HASH_LENGTH = 12;
const SHORT_COMMIT_SHA_LENGTH = 7;
const DEFAULT_REPORTS_DIR = 'evaluations/reports';

/** Aggregated latency statistics across multiple execution runs. */
export type AggregatedLatencyMetrics = {
  /** Minimum latency in milliseconds. */
  minMs: number;
  /** Mean latency in milliseconds. */
  meanMs: number;
  /** 95th percentile latency in milliseconds. */
  p95Ms: number;
  /** Maximum latency in milliseconds. */
  maxMs: number;
};

/** Individual run outcome for an evaluation engine. */
export type WhyEvaluationRunOutcome = {
  /** 1-based index of this execution iteration. */
  runIndex: number;
  /** Status of this individual run. */
  status: 'completed' | 'failed';
  /** Latency observed for this execution in milliseconds. */
  latencyMs: number;
  /** Token usage recorded for this run, when available. */
  tokenUsage?: WhyExtractionUsage;
  /** Model actually served by the API, when exposed. */
  servedModel?: string;
  /** Throttle and retry diagnostics observed during this run. */
  diagnostics?: WhyExtractionDiagnostics;
  /** Error message if this execution failed. */
  error?: string;
};

/** Aggregated evaluation report for a single engine across repeated runs. */
export type WhyEvaluationEngineReport = {
  /** Engine identifier (e.g., "jev", "openai", "anthropic"). */
  engine: string;
  /** Model configured or requested for evaluation. */
  requestedModel: string;
  /** Model actually served by the provider API across runs. */
  servedModel?: string;
  /** Overall engine evaluation status. */
  status: 'completed' | 'failed' | 'skipped';
  /** Total number of attempted execution runs. */
  runsCount: number;
  /** Number of successfully completed runs. */
  successCount: number;
  /** Number of failed runs. */
  failureCount: number;
  /** Aggregated latency metrics across successful runs. */
  latency?: AggregatedLatencyMetrics;
  /** Aggregated or latest token accounting. */
  tokenUsage?: WhyExtractionUsage;
  /** Aggregated throttle and retry diagnostics across runs. */
  diagnostics?: WhyExtractionDiagnostics;
  /** Quality metrics computed from the successful evaluation run. */
  metrics?: WhyEvaluationMetrics;
  /** Confidence and threshold metrics (populated for Jev). */
  confidence?: JevConfidenceMetrics;
  /** Distinct failure reasons recorded across runs, when any run failed. */
  failureReasons?: string[];
  /** Serialized character size of the evaluation input payload. */
  inputCharacters: number;
  /** Top-level failure error message if skipped or all runs failed. */
  error?: string;
};

/** Complete persisted evaluation artifact with reproducibility metadata. */
export type WhyEvaluationArtifact = {
  /** Current Git commit SHA at the time of evaluation. */
  commitSha: string;
  /** ISO-8601 timestamp of evaluation start. */
  timestamp: string;
  /** Deterministic content hash of the evaluation corpus fixture. */
  corpusRevision: string;
  /** Number of labeled cases in the corpus fixture. */
  corpusCases: number;
  /** Serialized character count of the input prompt payload. */
  inputCharacters: number;
  /** Number of repeated execution runs requested per engine. */
  runsRequested: number;
  /** Engine evaluation reports. */
  engines: WhyEvaluationEngineReport[];
};

/**
 * Calculates minimum, mean, 95th percentile, and maximum latency.
 * @param latenciesMs Array of observed latency measurements in milliseconds.
 * @returns Aggregated latency metrics, or undefined when the input array is empty.
 */
export function calculateAggregatedLatency(
  latenciesMs: readonly number[],
): AggregatedLatencyMetrics | undefined {
  if (latenciesMs.length === 0) return undefined;

  const sortedLatencies = [...latenciesMs].sort(
    (leftValue, rightValue) => leftValue - rightValue,
  );
  const latencySum = sortedLatencies.reduce(
    (accumulator, latency) => accumulator + latency,
    0,
  );
  const meanMs = latencySum / sortedLatencies.length;
  const minMs = sortedLatencies[0] ?? 0;
  const maxMs = sortedLatencies[sortedLatencies.length - 1] ?? 0;

  // WHY: For small sample sizes (e.g. 3-5 runs), ceil index mapping gives a stable p95 estimate
  // that points to the upper percentile without requiring interpolation between few points.
  const p95Index = Math.min(
    sortedLatencies.length - 1,
    Math.max(0, Math.ceil(sortedLatencies.length * PERCENTILE_95_RATIO) - 1),
  );
  const p95Ms = sortedLatencies[p95Index] ?? maxMs;

  return { minMs, meanMs, p95Ms, maxMs };
}

/**
 * Computes a stable hexadecimal content hash representing the evaluation corpus state.
 * @param corpus Array of labeled evaluation cases.
 * @returns Deterministic SHA-256 slice for reproducibility comparison.
 */
export function calculateCorpusRevision(
  corpus: readonly WhyEvaluationCase[],
): string {
  const serializedCorpus = JSON.stringify(corpus);
  return createHash('sha256')
    .update(serializedCorpus)
    .digest('hex')
    .slice(0, CORPUS_HASH_LENGTH);
}

/**
 * Resolves the current git commit SHA from the environment or local git repository.
 * @returns Commit SHA string, or "unknown" if unresolvable.
 */
export function resolveCurrentCommitSha(): string {
  const ciSha = process.env.GITHUB_SHA;
  if (ciSha) return ciSha.trim();

  try {
    const gitOutput = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return gitOutput.trim();
  } catch {
    return 'unknown';
  }
}

function formatLatencyNumber(milliseconds?: number): string {
  if (milliseconds === undefined) return '-';
  return `${Math.round(milliseconds)} ms`;
}

function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '-';
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Generates a human-readable Markdown summary report from an evaluation artifact.
 * @param artifact Persisted evaluation artifact.
 * @returns Markdown formatted summary report.
 */
export function generateEvaluationMarkdownSummary(
  artifact: WhyEvaluationArtifact,
): string {
  const lines: string[] = [
    '# WHY Extraction Evaluation Report',
    '',
    `- **Timestamp**: \`${artifact.timestamp}\``,
    `- **Commit SHA**: \`${artifact.commitSha}\``,
    `- **Corpus Revision**: \`${artifact.corpusRevision}\` (${artifact.corpusCases} cases)`,
    `- **Runs Requested**: \`${artifact.runsRequested}\``,
    '',
    '## Engine Comparison',
    '',
    '| Engine | Status | Requested Model | Served Model | Latency (mean / p95) | Tokens (in / out) | Precision | Recall | F1 | Exact Preservation | Retries / Throttled |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const engineReport of artifact.engines) {
    const latencyDisplay = engineReport.latency
      ? `${formatLatencyNumber(engineReport.latency.meanMs)} / ${formatLatencyNumber(engineReport.latency.p95Ms)}`
      : '-';
    const tokensDisplay = engineReport.tokenUsage
      ? `${engineReport.tokenUsage.inputTokens} / ${engineReport.tokenUsage.outputTokens}`
      : '-';
    const metrics = engineReport.metrics;
    const precisionDisplay = formatRate(metrics?.precision);
    const recallDisplay = formatRate(metrics?.recall);
    const f1Display = formatRate(metrics?.f1);
    const exactPreservationDisplay = formatRate(
      metrics?.exactCandidatePreservationRate,
    );
    const diagnosticsDisplay = engineReport.diagnostics
      ? `${engineReport.diagnostics.retries} / ${engineReport.diagnostics.throttled ? 'yes' : 'no'}`
      : '-';

    lines.push(
      `| **${engineReport.engine}** | \`${engineReport.status}\` | \`${engineReport.requestedModel}\` | \`${engineReport.servedModel ?? '-'}\` | ${latencyDisplay} | ${tokensDisplay} | ${precisionDisplay} | ${recallDisplay} | ${f1Display} | ${exactPreservationDisplay} | ${diagnosticsDisplay} |`,
    );
  }

  const jevReport = artifact.engines.find((report) => report.confidence);
  if (jevReport?.confidence) {
    lines.push(
      '',
      '## Jev Confidence Calibration',
      '',
      `- **Evaluated Candidates**: \`${jevReport.confidence.candidateCount}\``,
      `- **Brier Score**: \`${jevReport.confidence.brierScore?.toFixed(4) ?? '-'}\``,
      `- **Mean Positive Probability**: \`${jevReport.confidence.meanPositiveProbability?.toFixed(4) ?? '-'}\``,
      `- **Mean Negative Probability**: \`${jevReport.confidence.meanNegativeProbability?.toFixed(4) ?? '-'}\``,
      '',
      '| Threshold | True Positives | False Positives | False Negatives | Precision | Recall | F1 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    );
    for (const thresholdMetric of jevReport.confidence.thresholds) {
      lines.push(
        `| **${thresholdMetric.threshold.toFixed(2)}** | ${thresholdMetric.truePositives} | ${thresholdMetric.falsePositives} | ${thresholdMetric.falseNegatives} | ${formatRate(thresholdMetric.precision)} | ${formatRate(thresholdMetric.recall)} | ${formatRate(thresholdMetric.f1)} |`,
      );
    }
  }

  const failedEngines = artifact.engines.filter(
    (report) => report.failureReasons && report.failureReasons.length > 0,
  );
  if (failedEngines.length > 0) {
    lines.push('', '## Diagnostics & Failures', '');
    for (const engine of failedEngines) {
      lines.push(`### ${engine.engine} Failures`);
      for (const reason of engine.failureReasons ?? []) {
        lines.push(`- ${reason}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Persists machine-readable JSON and human-readable Markdown evaluation reports to disk.
 * @param artifact Evaluation artifact containing all reproducibility metadata and results.
 * @param outputDirectory Directory where reports should be written; defaults to "evaluations/reports".
 * @returns Written file paths.
 */
export function persistEvaluationReports(
  artifact: WhyEvaluationArtifact,
  outputDirectory: string = DEFAULT_REPORTS_DIR,
): { jsonPath: string; markdownPath: string } {
  mkdirSync(outputDirectory, { recursive: true });

  // WHY: Windows and some filesystems disallow colons in file names; replacing with dashes ensures
  // consistent cross-platform report persistence.
  const safeTimestamp = artifact.timestamp.replace(/[:.]/g, '-');
  const shortSha = artifact.commitSha.slice(0, SHORT_COMMIT_SHA_LENGTH);
  const baseFileName = `eval-${safeTimestamp}-${shortSha}`;

  const jsonPath = join(outputDirectory, `${baseFileName}.json`);
  const markdownPath = join(outputDirectory, `${baseFileName}.md`);

  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  writeFileSync(
    markdownPath,
    generateEvaluationMarkdownSummary(artifact),
    'utf8',
  );

  return { jsonPath, markdownPath };
}
