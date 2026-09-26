import { performance } from 'node:perf_hooks';

import { PROVIDER_NAMES, PROVIDER_OPENAI } from '@/constants/provider.js';
import { WHY_EVALUATION_CORPUS } from '@/evaluation/why-corpus.js';
import {
  evaluateJevConfidence,
  evaluateWhySelections,
} from '@/evaluation/why-evaluation.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { JevWhyExtractor } from '@/providers/jev-why.js';
import type { ProviderName } from '@/types/llm.js';
import type { WhyExtractionInput, WhyExtractionOutput } from '@/types/why.js';
import type {
  UsageReportingWhyExtractor,
  WhyExtractionUsage,
  WhyExtractor,
} from '@/types/why-extractor.js';
import { providerFactory } from '@/utils/provider.js';

type EvaluationEngineReport = {
  engine: string;
  model: string;
  status: 'completed' | 'failed' | 'skipped';
  latencyMs?: number;
  metrics?: ReturnType<typeof evaluateWhySelections>;
  confidence?: ReturnType<typeof evaluateJevConfidence>;
  tokenUsage?: WhyExtractionUsage;
  inputCharacters: number;
  error?: string;
};

function evaluationProviderName(): ProviderName {
  const configuredProvider = process.env.WHY_EVALUATION_PROVIDER;
  if (!configuredProvider) return PROVIDER_OPENAI;
  if (PROVIDER_NAMES.includes(configuredProvider as ProviderName)) {
    return configuredProvider as ProviderName;
  }
  throw new Error(
    `Invalid WHY_EVALUATION_PROVIDER: ${configuredProvider}. Expected one of: ${PROVIDER_NAMES.join(', ')}`,
  );
}

async function evaluateEngine(
  engine: string,
  model: string,
  hasApiKey: boolean,
  extractor: WhyExtractor,
  input: WhyExtractionInput,
  inputCharacters: number,
): Promise<EvaluationEngineReport> {
  if (!hasApiKey) {
    return {
      engine,
      model,
      status: 'skipped',
      inputCharacters,
      error: 'API key is not configured',
    };
  }

  const startedAt = performance.now();
  try {
    const output: WhyExtractionOutput = await extractor.extractWhyNotes(input);
    const tokenUsage = (extractor as UsageReportingWhyExtractor)
      .lastWhyExtractionUsage;
    return {
      engine,
      model,
      status: 'completed',
      latencyMs: performance.now() - startedAt,
      metrics: evaluateWhySelections(WHY_EVALUATION_CORPUS, output.items),
      ...(engine === 'jev'
        ? {
            confidence: evaluateJevConfidence(
              WHY_EVALUATION_CORPUS,
              output.selectionDiagnostics ?? [],
            ),
          }
        : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
      inputCharacters,
    };
  } catch (error) {
    return {
      engine,
      model,
      status: 'failed',
      latencyMs: performance.now() - startedAt,
      inputCharacters,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function run(): Promise<void> {
  const providerName = evaluationProviderName();
  const appConfig = loadAppConfig();
  const provider = providerFactory(providerName, appConfig.providers);
  const jev = new JevWhyExtractor(appConfig.typesafe);
  const input: WhyExtractionInput = {
    language: 'en',
    whyLabel: 'Why',
    items: WHY_EVALUATION_CORPUS.map((evaluationCase) => evaluationCase.item),
  };
  const inputCharacters = JSON.stringify(input).length;
  // WHY: Sequential runs prevent concurrent requests from changing either
  // engine's latency or rate-limit behavior during a comparison.
  const engines = [
    await evaluateEngine(
      'jev',
      appConfig.typesafe.model,
      Boolean(appConfig.typesafe.apiKey),
      jev,
      input,
      inputCharacters,
    ),
    await evaluateEngine(
      provider.name,
      provider.modelName,
      Boolean(appConfig.providers[providerName].apiKey),
      provider,
      input,
      inputCharacters,
    ),
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        corpusCases: WHY_EVALUATION_CORPUS.length,
        inputCharacters,
        engines,
      },
      null,
      2,
    )}\n`,
  );
}

void run();
