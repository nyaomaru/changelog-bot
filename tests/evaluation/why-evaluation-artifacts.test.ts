import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from '@jest/globals';

import {
  calculateAggregatedLatency,
  calculateCorpusRevision,
  generateEvaluationMarkdownSummary,
  persistEvaluationReports,
  resolveCurrentCommitSha,
  type WhyEvaluationArtifact,
} from '@/evaluation/why-evaluation-artifacts.js';
import type { WhyEvaluationCase } from '@/evaluation/why-evaluation.js';

const SAMPLE_CASE: WhyEvaluationCase = {
  id: 'test-case-1',
  item: {
    prNumber: 42,
    title: 'Fix issue',
    itemText: 'Fix issue',
    sectionTitle: 'Fixed',
    trustScore: 9,
    trustBucket: 'high',
    requiresHighConfidence: false,
    candidates: ['Reason: prevents memory leak'],
  },
  expectedSelectedCandidateIndex: 0,
};

const SAMPLE_ARTIFACT: WhyEvaluationArtifact = {
  commitSha: 'abc1234567890',
  timestamp: '2026-09-27T16:00:00.000Z',
  corpusRevision: 'rev123456789',
  corpusCases: 1,
  inputCharacters: 250,
  runsRequested: 3,
  engines: [
    {
      engine: 'jev',
      requestedModel: 'jev-latest',
      servedModel: 'jev-1.0-prod',
      status: 'completed',
      runsCount: 3,
      successCount: 3,
      failureCount: 0,
      latency: {
        minMs: 100,
        meanMs: 120,
        p95Ms: 140,
        maxMs: 140,
      },
      tokenUsage: {
        inputTokens: 50,
        outputTokens: 10,
      },
      diagnostics: {
        retries: 1,
        throttled: true,
      },
      metrics: {
        caseCount: 1,
        expectedSelections: 1,
        predictedSelections: 1,
        truePositives: 1,
        falsePositives: 0,
        falseNegatives: 0,
        precision: 1,
        recall: 1,
        f1: 1,
        exactCandidatePreservations: 1,
        exactCandidatePreservationRate: 1,
        unexpectedSelections: 0,
        duplicateSelections: 0,
        outcomes: [],
      },
      confidence: {
        candidateCount: 1,
        brierScore: 0.05,
        meanPositiveProbability: 0.92,
        meanNegativeProbability: null,
        thresholds: [
          {
            threshold: 0.6,
            truePositives: 1,
            falsePositives: 0,
            falseNegatives: 0,
            precision: 1,
            recall: 1,
            f1: 1,
          },
        ],
      },
      inputCharacters: 250,
    },
    {
      engine: 'openai',
      requestedModel: 'gpt-4o',
      servedModel: 'gpt-4o-2024-08-06',
      status: 'failed',
      runsCount: 3,
      successCount: 1,
      failureCount: 2,
      latency: {
        minMs: 300,
        meanMs: 300,
        p95Ms: 300,
        maxMs: 300,
      },
      tokenUsage: {
        inputTokens: 80,
        outputTokens: 15,
      },
      failureReasons: ['Run 2 (300ms): 500 Internal Server Error'],
      inputCharacters: 250,
    },
  ],
};

describe('calculateAggregatedLatency', () => {
  test('returns undefined for empty input array', () => {
    expect(calculateAggregatedLatency([])).toBeUndefined();
  });

  test('calculates correct statistics for a single latency measurement', () => {
    expect(calculateAggregatedLatency([150])).toEqual({
      minMs: 150,
      meanMs: 150,
      p95Ms: 150,
      maxMs: 150,
    });
  });

  test('calculates min, mean, p95, and max for multiple measurements', () => {
    const latencies = [100, 200, 300, 400, 500];
    const stats = calculateAggregatedLatency(latencies);
    expect(stats).toBeDefined();
    expect(stats?.minMs).toBe(100);
    expect(stats?.maxMs).toBe(500);
    expect(stats?.meanMs).toBe(300);
    expect(stats?.p95Ms).toBe(500);
  });
});

describe('calculateCorpusRevision', () => {
  test('generates a stable hexadecimal hash of the corpus', () => {
    const hashOne = calculateCorpusRevision([SAMPLE_CASE]);
    const hashTwo = calculateCorpusRevision([SAMPLE_CASE]);
    expect(hashOne).toBe(hashTwo);
    expect(hashOne).toHaveLength(12);
  });

  test('changes when corpus content is modified', () => {
    const originalHash = calculateCorpusRevision([SAMPLE_CASE]);
    const modifiedCase: WhyEvaluationCase = {
      ...SAMPLE_CASE,
      item: {
        ...SAMPLE_CASE.item,
        title: 'Different title',
      },
    };
    const modifiedHash = calculateCorpusRevision([modifiedCase]);
    expect(originalHash).not.toBe(modifiedHash);
  });
});

describe('resolveCurrentCommitSha', () => {
  const originalEnv = process.env.GITHUB_SHA;

  afterEach(() => {
    process.env.GITHUB_SHA = originalEnv;
  });

  test('prefers GITHUB_SHA environment variable when set', () => {
    process.env.GITHUB_SHA = 'ci-commit-sha-12345';
    expect(resolveCurrentCommitSha()).toBe('ci-commit-sha-12345');
  });

  test('resolves a commit SHA from local repository when env is absent', () => {
    delete process.env.GITHUB_SHA;
    const sha = resolveCurrentCommitSha();
    expect(typeof sha).toBe('string');
    expect(sha.length).toBeGreaterThan(0);
  });
});

describe('generateEvaluationMarkdownSummary', () => {
  test('renders markdown tables including engine comparison and Jev calibration', () => {
    const markdown = generateEvaluationMarkdownSummary(SAMPLE_ARTIFACT);

    expect(markdown).toContain('# WHY Extraction Evaluation Report');
    expect(markdown).toContain('- **Commit SHA**: `abc1234567890`');
    expect(markdown).toContain('- **Corpus Revision**: `rev123456789`');
    expect(markdown).toContain(
      '| **jev** | `completed` | `jev-latest` | `jev-1.0-prod` |',
    );
    expect(markdown).toContain(
      '| **openai** | `failed` | `gpt-4o` | `gpt-4o-2024-08-06` |',
    );
    expect(markdown).toContain('## Jev Confidence Calibration');
    expect(markdown).toContain(
      '| **0.60** | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |',
    );
    expect(markdown).toContain('## Diagnostics & Failures');
    expect(markdown).toContain('### openai Failures');
    expect(markdown).toContain('Run 2 (300ms): 500 Internal Server Error');
  });
});

describe('persistEvaluationReports', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('writes both JSON and Markdown report files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'why-eval-test-'));
    const { jsonPath, markdownPath } = persistEvaluationReports(
      SAMPLE_ARTIFACT,
      tempDir,
    );

    const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(jsonContent.commitSha).toBe(SAMPLE_ARTIFACT.commitSha);
    expect(jsonContent.engines).toHaveLength(2);

    const markdownContent = readFileSync(markdownPath, 'utf8');
    expect(markdownContent).toContain('# WHY Extraction Evaluation Report');
    expect(markdownContent).toContain(SAMPLE_ARTIFACT.commitSha);
  });
});
