import { performance } from 'node:perf_hooks';

import { PROVIDER_NAMES, PROVIDER_OPENAI } from '@/constants/provider.js';
import { JEV_WHY_ENGINE_NAME } from '@/constants/jev.js';
import { WHY_EVALUATION_CORPUS } from '@/evaluation/why-corpus.js';
import {
  evaluateJevConfidence,
  evaluateWhySelections,
} from '@/evaluation/why-evaluation.js';
import {
  calculateAggregatedLatency,
  calculateCorpusRevision,
  persistEvaluationReports,
  resolveCurrentCommitSha,
  type WhyEvaluationArtifact,
  type WhyEvaluationEngineReport,
} from '@/evaluation/why-evaluation-artifacts.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { JevWhyExtractor } from '@/providers/jev-why.js';
import type { ProviderName } from '@/types/llm.js';
import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';
import type {
  WhyExtractionDiagnostics,
  WhyExtractionUsage,
  WhyExtractor,
} from '@/types/why-extractor.js';
import { providerFactory } from '@/utils/provider.js';

const DEFAULT_RUNS_COUNT = 1;
const DEFAULT_OUTPUT_DIRECTORY = 'evaluations/reports';

export function evaluationProviderName(): ProviderName {
  const configuredProvider = process.env.WHY_EVALUATION_PROVIDER;
  if (!configuredProvider) return PROVIDER_OPENAI;
  if (PROVIDER_NAMES.includes(configuredProvider as ProviderName)) {
    return configuredProvider as ProviderName;
  }
  throw new Error(
    `Invalid WHY_EVALUATION_PROVIDER: ${configuredProvider}. Expected one of: ${PROVIDER_NAMES.join(', ')}`,
  );
}

export function parseEvaluationRuns(): number {
  const envRuns = process.env.WHY_EVALUATION_RUNS;
  if (envRuns) {
    const parsedRuns = parseInt(envRuns, 10);
    if (!Number.isNaN(parsedRuns) && parsedRuns > 0) return parsedRuns;
  }
  const flagIndex = process.argv.indexOf('--runs');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    const parsedFlagRuns = parseInt(process.argv[flagIndex + 1], 10);
    if (!Number.isNaN(parsedFlagRuns) && parsedFlagRuns > 0) {
      return parsedFlagRuns;
    }
  }
  return DEFAULT_RUNS_COUNT;
}

export function parseOutputDirectory(): string {
  const flagIndex = process.argv.indexOf('--output-dir');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1];
  }
  return process.env.WHY_EVALUATION_OUTPUT_DIR || DEFAULT_OUTPUT_DIRECTORY;
}

export function parseNoPersistOption(): boolean {
  return (
    process.argv.includes('--no-persist') ||
    process.env.WHY_EVALUATION_NO_PERSIST === 'true' ||
    process.env.WHY_EVALUATION_NO_PERSIST === '1'
  );
}

export async function evaluateEngineWithRepeatedRuns(
  engine: string,
  requestedModel: string,
  hasApiKey: boolean,
  extractor: WhyExtractor,
  input: WhyExtractionInput,
  inputCharacters: number,
  runsRequested: number,
): Promise<WhyEvaluationEngineReport> {
  if (!hasApiKey) {
    return {
      engine,
      requestedModel,
      status: 'skipped',
      runsCount: 0,
      successCount: 0,
      failureCount: 0,
      inputCharacters,
      error: 'API key is not configured',
    };
  }

  const completedLatencies: number[] = [];
  const failureReasons: string[] = [];
  let latestOutput: WhyExtractionOutput | undefined;
  let latestUsage: WhyExtractionUsage | undefined;
  let servedModel: string | undefined;
  let totalRetries = 0;
  let throttled = false;

  // WHY: Sequential runs prevent concurrent requests from changing either
  // engine's latency or rate-limit behavior during a comparison.
  for (let runIndex = 1; runIndex <= runsRequested; runIndex += 1) {
    const startedAt = performance.now();
    try {
      const output = await extractor.extractWhyNotes(input);
      const latencyMs = performance.now() - startedAt;
      completedLatencies.push(latencyMs);
      latestOutput = output;
      if (extractor.lastWhyExtractionUsage) {
        latestUsage = extractor.lastWhyExtractionUsage;
      }
      if (extractor.lastServedModel) {
        servedModel = extractor.lastServedModel;
      }
      if (extractor.lastWhyExtractionDiagnostics) {
        totalRetries += extractor.lastWhyExtractionDiagnostics.retries;
        if (extractor.lastWhyExtractionDiagnostics.throttled) {
          throttled = true;
        }
      }
    } catch (error) {
      const latencyMs = performance.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      failureReasons.push(
        `Run ${runIndex} (${Math.round(latencyMs)}ms): ${message}`,
      );
      if (extractor.lastWhyExtractionUsage) {
        latestUsage = extractor.lastWhyExtractionUsage;
      }
      if (extractor.lastServedModel) {
        servedModel = extractor.lastServedModel;
      }
      if (extractor.lastWhyExtractionDiagnostics) {
        totalRetries += extractor.lastWhyExtractionDiagnostics.retries;
        if (extractor.lastWhyExtractionDiagnostics.throttled) {
          throttled = true;
        }
      }
    }
  }

  const successCount = completedLatencies.length;
  const failureCount = failureReasons.length;
  const latency = calculateAggregatedLatency(completedLatencies);
  const diagnostics: WhyExtractionDiagnostics = {
    retries: totalRetries,
    throttled,
  };

  if (successCount === 0) {
    return {
      engine,
      requestedModel,
      ...(servedModel ? { servedModel } : {}),
      status: 'failed',
      runsCount: runsRequested,
      successCount: 0,
      failureCount,
      inputCharacters,
      ...(latestUsage ? { tokenUsage: latestUsage } : {}),
      diagnostics,
      failureReasons,
      error: failureReasons[0],
    };
  }

  return {
    engine,
    requestedModel,
    ...(servedModel ? { servedModel } : {}),
    status: 'completed',
    runsCount: runsRequested,
    successCount,
    failureCount,
    latency,
    ...(latestUsage ? { tokenUsage: latestUsage } : {}),
    diagnostics,
    ...(failureReasons.length > 0 ? { failureReasons } : {}),
    metrics: evaluateWhySelections(
      WHY_EVALUATION_CORPUS,
      latestOutput?.items ?? [],
    ),
    ...(engine === JEV_WHY_ENGINE_NAME && latestOutput?.selectionDiagnostics
      ? {
          confidence: evaluateJevConfidence(
            WHY_EVALUATION_CORPUS,
            latestOutput.selectionDiagnostics,
          ),
        }
      : {}),
    inputCharacters,
  };
}

export async function runWhyEvaluation(): Promise<WhyEvaluationArtifact> {
  const providerName = evaluationProviderName();
  const runsRequested = parseEvaluationRuns();
  const outputDirectory = parseOutputDirectory();
  const noPersist = parseNoPersistOption();

  const appConfig = loadAppConfig();
  const provider = providerFactory(providerName, appConfig.providers);
  const jev = new JevWhyExtractor(appConfig.typesafe);

  const input: WhyExtractionInput = {
    language: 'en',
    whyLabel: 'Why',
    items: WHY_EVALUATION_CORPUS.map((evaluationCase) => evaluationCase.item),
  };
  const inputCharacters = JSON.stringify(input).length;

  const engines = [
    await evaluateEngineWithRepeatedRuns(
      JEV_WHY_ENGINE_NAME,
      appConfig.typesafe.model,
      Boolean(appConfig.typesafe.apiKey),
      jev,
      input,
      inputCharacters,
      runsRequested,
    ),
    await evaluateEngineWithRepeatedRuns(
      provider.name,
      provider.modelName,
      Boolean(appConfig.providers[providerName].apiKey),
      provider,
      input,
      inputCharacters,
      runsRequested,
    ),
  ];

  const artifact: WhyEvaluationArtifact = {
    commitSha: resolveCurrentCommitSha(),
    timestamp: new Date().toISOString(),
    corpusRevision: calculateCorpusRevision(WHY_EVALUATION_CORPUS),
    corpusCases: WHY_EVALUATION_CORPUS.length,
    inputCharacters,
    runsRequested,
    engines,
  };

  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);

  if (!noPersist) {
    const { jsonPath, markdownPath } = persistEvaluationReports(
      artifact,
      outputDirectory,
    );
    process.stderr.write(
      `Saved evaluation reports to ${jsonPath} and ${markdownPath}\n`,
    );
  }

  return artifact;
}

void runWhyEvaluation();
