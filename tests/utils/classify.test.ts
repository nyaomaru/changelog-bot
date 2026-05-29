// @ts-nocheck
import {
  afterEach,
  beforeEach,
  describe,
  test,
  expect,
  jest,
} from '@jest/globals';
import { loadAppConfig } from '@/lib/app-config.js';
import { classifyTitles } from '@/utils/classify.js';
import {
  PROVIDER_OPENAI,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
} from '@/constants/provider.js';

describe('classifyTitles', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('falls back to Chore when no API key', async () => {
    const config = loadAppConfig({}).providers.openai;
    const out = await classifyTitles(['Add login'], PROVIDER_OPENAI, config);

    expect(out).toEqual({ Chore: ['Add login'] });
  });

  test('falls back to Chore when provider config is omitted', async () => {
    const out = await classifyTitles(['Add login'], PROVIDER_OPENAI);

    expect(out).toEqual({ Chore: ['Add login'] });
  });

  test('classifies via OpenAI with mocked fetch', async () => {
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

  test('classifies via Gemini with mocked fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ Changed: ['Tune parser'] }) }],
              },
            },
          ],
        }),
    });

    const config = loadAppConfig({
      GEMINI_API_KEY: 'gemini-test',
    }).providers.gemini;
    const out = await classifyTitles(['Tune parser'], PROVIDER_GEMINI, config);

    expect(out).toEqual({ Changed: ['Tune parser'] });
  });
});
