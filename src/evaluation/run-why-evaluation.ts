import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

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
  type WhyEvaluationRunOutcome,
} from '@/evaluation/why-evaluation-artifacts.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { JevWhyExtractor } from '@/providers/jev-why.js';
import type { ProviderName } from '@/types/llm.js';
import type { WhyExtractionInput } from '@/types/why.js';
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

  const runs: WhyEvaluationRunOutcome[] = [];

  // WHY: Sequential runs prevent concurrent requests from changing either
  // engine's latency or rate-limit behavior during a comparison.
  for (let runIndex = 1; runIndex <= runsRequested; runIndex += 1) {
    const startedAt = performance.now();
    try {
      const output = await extractor.extractWhyNotes(input);
      const latencyMs = performance.now() - startedAt;
      const metrics = evaluateWhySelections(
        WHY_EVALUATION_CORPUS,
        output.items ?? [],
      );
      const confidence =
        engine === JEV_WHY_ENGINE_NAME && output.selectionDiagnostics
          ? evaluateJevConfidence(
              WHY_EVALUATION_CORPUS,
              output.selectionDiagnostics,
            )
          : undefined;

      runs.push({
        runIndex,
        status: 'completed',
        latencyMs,
        tokenUsage: extractor.lastWhyExtractionUsage,
        servedModel: extractor.lastServedModel,
        diagnostics: extractor.lastWhyExtractionDiagnostics,
        metrics,
        ...(confidence ? { confidence } : {}),
      });
    } catch (error) {
      const latencyMs = performance.now() - startedAt;
      runs.push({
        runIndex,
        status: 'failed',
        latencyMs,
        tokenUsage: extractor.lastWhyExtractionUsage,
        servedModel: extractor.lastServedModel,
        diagnostics: extractor.lastWhyExtractionDiagnostics,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successfulRuns = runs.filter((r) => r.status === 'completed');
  const failedRuns = runs.filter((r) => r.status === 'failed');
  const completedLatencies = successfulRuns.map((r) => r.latencyMs);
  const latency = calculateAggregatedLatency(completedLatencies);

  const totalRetries = runs.reduce(
    (sum, r) => sum + (r.diagnostics?.retries ?? 0),
    0,
  );
  const throttled = runs.some((r) => r.diagnostics?.throttled);
  const diagnostics: WhyExtractionDiagnostics = {
    retries: totalRetries,
    throttled,
  };

  // Derive aggregated token usage from successful runs or latest observed
  const tokenUsage =
    successfulRuns.reduce<WhyExtractionUsage | undefined>((acc, r) => {
      if (!r.tokenUsage) return acc;
      return {
        inputTokens: (acc?.inputTokens ?? 0) + r.tokenUsage.inputTokens,
        outputTokens: (acc?.outputTokens ?? 0) + r.tokenUsage.outputTokens,
      };
    }, undefined) ?? runs.find((r) => r.tokenUsage)?.tokenUsage;

  const servedModel = runs.find((r) => r.servedModel)?.servedModel;
  const failureReasons = failedRuns.map(
    (r) => `Run ${r.runIndex} (${Math.round(r.latencyMs)}ms): ${r.error}`,
  );
  const primaryRun = successfulRuns[0];

  if (successfulRuns.length === 0) {
    return {
      engine,
      requestedModel,
      ...(servedModel ? { servedModel } : {}),
      status: 'failed',
      runsCount: runsRequested,
      successCount: 0,
      failureCount: failedRuns.length,
      runs,
      inputCharacters,
      ...(tokenUsage ? { tokenUsage } : {}),
      diagnostics,
      failureReasons,
      error: failedRuns[0]?.error ?? failureReasons[0],
    };
  }

  return {
    engine,
    requestedModel,
    ...(servedModel ? { servedModel } : {}),
    status: 'completed',
    runsCount: runsRequested,
    successCount: successfulRuns.length,
    failureCount: failedRuns.length,
    runs,
    latency,
    ...(tokenUsage ? { tokenUsage } : {}),
    diagnostics,
    ...(failureReasons.length > 0 ? { failureReasons } : {}),
    ...(primaryRun?.metrics ? { metrics: primaryRun.metrics } : {}),
    ...(primaryRun?.confidence ? { confidence: primaryRun.confidence } : {}),
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

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void runWhyEvaluation();
}
