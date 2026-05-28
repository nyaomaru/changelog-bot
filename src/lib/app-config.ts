import { EnvSchema } from '@/schema/env.js';
import { DEFAULT_OPENAI_MODEL } from '@/constants/openai.js';
import { DEFAULT_ANTHROPIC_MODEL } from '@/constants/anthropic.js';
import { DEFAULT_GEMINI_MODEL } from '@/constants/gemini.js';
import { GITHUB_API_BASE_DEFAULT } from '@/constants/github.js';
import type {
  AppConfig,
  ProviderRuntimeConfig,
  ProviderRuntimeConfigMap,
} from '@/types/config.js';
import type { ProviderName } from '@/types/llm.js';

/**
 * Resolve runtime configuration from environment variables once per process.
 * WHY: Centralizing env parsing keeps provider, GitHub, and repository code
 * deterministic and removes hidden global reads from deeper modules.
 * @param env Environment variables to inspect.
 * @returns Normalized runtime configuration for the CLI invocation.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsedEnv = EnvSchema.safeParse(env);
  const runtimeEnv = parsedEnv.success ? parsedEnv.data : env;

  const providers: ProviderRuntimeConfigMap = {
    openai: {
      apiKey: runtimeEnv.OPENAI_API_KEY,
      model: runtimeEnv.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    },
    anthropic: {
      apiKey: runtimeEnv.ANTHROPIC_API_KEY,
      model: runtimeEnv.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    },
    gemini: {
      apiKey: runtimeEnv.GEMINI_API_KEY,
      model: runtimeEnv.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    },
  };

  return {
    github: {
      token: runtimeEnv.GITHUB_TOKEN,
      appId: runtimeEnv.CHANGELOG_BOT_APP_ID,
      appPrivateKey: runtimeEnv.CHANGELOG_BOT_APP_PRIVATE_KEY,
      appInstallationId: runtimeEnv.CHANGELOG_BOT_APP_INSTALLATION_ID,
      apiBase:
        runtimeEnv.CHANGELOG_BOT_API_BASE ||
        runtimeEnv.GITHUB_API_BASE ||
        GITHUB_API_BASE_DEFAULT,
      repoFullName: runtimeEnv.REPO_FULL_NAME || runtimeEnv.GITHUB_REPOSITORY,
    },
    providers,
  };
}

/**
 * Resolve provider-specific runtime settings from the application config.
 * @param appConfig Runtime configuration for the current invocation.
 * @param providerName Provider identifier to look up.
 * @returns API key and model settings for the provider.
 */
export function getProviderRuntimeConfig(
  appConfig: AppConfig,
  providerName: ProviderName,
): ProviderRuntimeConfig {
  return appConfig.providers[providerName];
}
