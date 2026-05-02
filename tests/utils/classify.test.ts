// @ts-nocheck
import { describe, test, expect, jest } from '@jest/globals';
import { loadAppConfig } from '@/lib/app-config.js';
import { classifyTitles } from '@/utils/classify.js';
import { PROVIDER_OPENAI, PROVIDER_ANTHROPIC } from '@/constants/provider.js';

describe('classifyTitles', () => {
  const originalFetch = global.fetch;

  test('falls back to Chore when no API key', async () => {
    jest.resetAllMocks();
    global.fetch = originalFetch;
    const config = loadAppConfig({}).providers.openai;
    const out = await classifyTitles(['Add login'], PROVIDER_OPENAI, config);

    expect(out).toEqual({ Chore: ['Add login'] });
  });

  test('classifies via OpenAI with mocked fetch', async () => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ Added: ['Add login'] }),
              },
            },
          ],
        }),
    });

    const config = loadAppConfig({ OPENAI_API_KEY: 'sk-test' }).providers
      .openai;
    const out = await classifyTitles(['Add login'], PROVIDER_OPENAI, config);

    expect(out).toEqual({ Added: ['Add login'] });
  });

  test('classifies via Anthropic with mocked fetch', async () => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ text: JSON.stringify({ Fixed: ['Fix bug'] }) }],
        }),
    });

    const config = loadAppConfig({
      ANTHROPIC_API_KEY: 'ak-test',
    }).providers.anthropic;
    const out = await classifyTitles(['Fix bug'], PROVIDER_ANTHROPIC, config);

    expect(out).toEqual({ Fixed: ['Fix bug'] });
  });
});
