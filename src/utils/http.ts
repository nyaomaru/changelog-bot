import type { HttpError } from '@/types/http.js';
import { safeJsonParse } from '@/utils/json.js';

/**
 * Build a rich HttpError instance containing status code and parsed body details.
 * @param response Fetch response used when the request failed.
 * @param text Raw response text.
 * @param errorPrefix Prefix string to prepend to the error message.
 */
function buildHttpError(
  response: Response,
  text: string,
  errorPrefix: string
): HttpError {
  const parsed = safeJsonParse<unknown>(text);
  return Object.assign(
    new Error(`${errorPrefix} ${response.status}: ${text}`),
    {
      status: response.status,
      body: parsed ?? text,
    }
  );
}

/**
 * Parse the response body as JSON, throwing descriptive errors on failure.
 * @param response Fetch response.
 * @param errorPrefix Prefix string to include in thrown errors.
 * @returns Parsed JSON payload.
 */
async function parseJsonResponse<T>(
  response: Response,
  errorPrefix: string
): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw buildHttpError(response, text, errorPrefix);
  }

  const data = safeJsonParse<T>(text);
  if (data === undefined) {
    throw new Error(`${errorPrefix} failed to parse JSON response`);
  }
  return data;
}

/**
 * POST JSON and parse the JSON response, throwing rich errors on non-2xx.
 * WHY: Centralizes minimal fetch handling and consistent error construction.
 * @param url Target endpoint.
 * @param payload Serializable request body.
 * @param headers Headers to merge with `Content-Type: application/json`.
 * @param errorPrefix Label included in thrown error messages (e.g., provider name).
 * @returns Parsed JSON response typed as `T`.
 */
export async function postJson<T>(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  errorPrefix: string
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<T>(response, errorPrefix);
}

/**
 * GET JSON and parse the JSON response, throwing rich errors on non-2xx.
 * @param url Target endpoint.
 * @param headers Request headers.
 * @param errorPrefix Label included in thrown error messages.
 * @returns Parsed JSON payload typed as `T`.
 */
export async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  errorPrefix: string
): Promise<T> {
  const response = await fetch(url, { headers });
  return parseJsonResponse<T>(response, errorPrefix);
}
