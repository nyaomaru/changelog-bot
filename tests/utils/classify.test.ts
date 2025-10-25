// @ts-nocheck
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { classifyTitles } from '@/utils/classify.js';
import { PROVIDER_OPENAI, PROVIDER_ANTHROPIC } from '@/constants/provider.js';

describe('classifyTitles', () => {
  const originalFetch = global.fetch;
  const origOpenAI = process.env.OPENAI_API_KEY;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = originalFetch as any;
    if (origOpenAI) process.env.OPENAI_API_KEY = origOpenAI;
    if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
  });

  test('falls back to Chore when no API key', async () => {
    const out = await classifyTitles(['Add login'], PROVIDER_OPENAI);

    expect(out).toEqual({ Chore: ['Add login'] });
  });

  test('classifies via OpenAI with mocked fetch', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
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

    const out = await classifyTitles(['Add login'], PROVIDER_OPENAI);

    expect(out).toEqual({ Added: ['Add login'] });
  });

  test('classifies via Anthropic with mocked fetch', async () => {
    process.env.ANTHROPIC_API_KEY = 'ak-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ text: JSON.stringify({ Fixed: ['Fix bug'] }) }],
        }),
    });

    const out = await classifyTitles(['Fix bug'], PROVIDER_ANTHROPIC);

    expect(out).toEqual({ Fixed: ['Fix bug'] });
  });
});
