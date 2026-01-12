// @ts-nocheck
import {
  describe,
  expect,
  test,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { postJson, getJson } from '@/utils/http.js';

describe('http utils', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = originalFetch as any;
  });

  test('postJson parses successful JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: 1 }),
    });

    const data = await postJson<{ ok: number }>(
      'https://api.example.com',
      { a: 1 },
      {},
      'POST',
    );

    expect(data.ok).toBe(1);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('postJson throws rich error on non-2xx with JSON body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: 'bad' }),
    });

    await expect(
      postJson('https://api.example.com', { a: 1 }, {}, 'X'),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('getJson parses successful JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ hello: 'world' }),
    });

    const data = await getJson<{ hello: string }>(
      'https://api.example.com',
      {},
      'GET',
    );

    expect(data.hello).toBe('world');
  });

  test('getJson throws error on non-2xx with text body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });

    await expect(
      getJson('https://api.example.com', {}, 'GET'),
    ).rejects.toMatchObject({ status: 500 });
  });
});
