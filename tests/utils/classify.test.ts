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
import { classifyChanges } from '@/utils/classify.js';
import {
  PROVIDER_OPENAI,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
} from '@/constants/provider.js';

describe('classifyChanges', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('falls back to Chore when no API key', async () => {
    const config = loadAppConfig({}).providers.openai;
    const out = await classifyChanges(
      [{ id: 'release-note:0', title: 'Add login' }],
      PROVIDER_OPENAI,
      config,
    );

    expect(out.assignments).toEqual({ 'release-note:0': 'Chore' });
  });

  test('falls back to Chore when provider config is omitted', async () => {
    const out = await classifyChanges(
      [{ id: 'release-note:0', title: 'Add login' }],
      PROVIDER_OPENAI,
    );

    expect(out.assignments).toEqual({ 'release-note:0': 'Chore' });
  });

  test('classifies via OpenAI with mocked fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ 'release-note:0': 'Added' }),
              },
            },
          ],
        }),
    });

    const config = loadAppConfig({ OPENAI_API_KEY: 'sk-test' }).providers
      .openai;
    const out = await classifyChanges(
      [{ id: 'release-note:0', title: 'Add login' }],
      PROVIDER_OPENAI,
      config,
    );

    expect(out.assignments).toEqual({ 'release-note:0': 'Added' });
  });

  test('classifies via Anthropic with mocked fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ text: JSON.stringify({ 'release-note:0': 'Fixed' }) }],
        }),
    });

    const config = loadAppConfig({
      ANTHROPIC_API_KEY: 'ak-test',
    }).providers.anthropic;
    const out = await classifyChanges(
      [{ id: 'release-note:0', title: 'Fix bug' }],
      PROVIDER_ANTHROPIC,
      config,
    );

    expect(out.assignments).toEqual({ 'release-note:0': 'Fixed' });
  });

  test('classifies via Gemini with mocked fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify({ 'release-note:0': 'Changed' }) },
                ],
              },
            },
          ],
        }),
    });

    const config = loadAppConfig({
      GEMINI_API_KEY: 'gemini-test',
    }).providers.gemini;
    const out = await classifyChanges(
      [{ id: 'release-note:0', title: 'Tune parser' }],
      PROVIDER_GEMINI,
      config,
    );

    expect(out.assignments).toEqual({ 'release-note:0': 'Changed' });
  });
});
