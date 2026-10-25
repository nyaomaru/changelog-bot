import type { MetadataLookupFailure } from '@/types/github.js';
import { isError, isRecord } from '@/utils/is.js';

function extractHttpStatus(errorCandidate: unknown): number | undefined {
  if (!isRecord(errorCandidate)) return undefined;
  if (
    typeof errorCandidate.status === 'number' &&
    Number.isInteger(errorCandidate.status)
  ) {
    return errorCandidate.status;
  }
  if (
    typeof errorCandidate.statusCode === 'number' &&
    Number.isInteger(errorCandidate.statusCode)
  ) {
    return errorCandidate.statusCode;
  }
  return undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function extractRetryAfterSeconds(errorCandidate: unknown): number | undefined {
  if (!isRecord(errorCandidate)) return undefined;

  // Direct retryAfter / retry_after on the error object
  const directRetryAfter =
    'retryAfter' in errorCandidate
      ? errorCandidate.retryAfter
      : 'retry_after' in errorCandidate
        ? errorCandidate.retry_after
        : undefined;
  const parsedDirect = parsePositiveNumber(directRetryAfter);
  if (parsedDirect !== undefined) return parsedDirect;

  // Body retry_after or retryAfter
  if (isRecord(errorCandidate.body)) {
    const bodyCandidate = errorCandidate.body as Record<string, unknown>;
    const bodyRetryAfter =
      bodyCandidate.retry_after ?? bodyCandidate.retryAfter;
    const parsedBody = parsePositiveNumber(bodyRetryAfter);
    if (parsedBody !== undefined) return parsedBody;
  }

  // Response headers or error headers for retry-after
  const headers = isRecord(errorCandidate.headers)
    ? errorCandidate.headers
    : isRecord(errorCandidate.response) &&
        isRecord((errorCandidate.response as Record<string, unknown>).headers)
      ? ((errorCandidate.response as Record<string, unknown>).headers as Record<
          string,
          unknown
        >)
      : undefined;

  if (headers) {
    const headerValue =
      headers['retry-after'] ??
      (typeof headers.get === 'function'
        ? (headers.get as (headerName: string) => unknown)('retry-after')
        : undefined);
    const parsedHeader = parsePositiveNumber(headerValue);
    if (parsedHeader !== undefined) return parsedHeader;
  }

  return undefined;
}

function extractErrorMessage(errorCandidate: unknown): string {
  if (isError(errorCandidate)) return errorCandidate.message;
  if (isRecord(errorCandidate)) {
    if (typeof errorCandidate.message === 'string')
      return errorCandidate.message;
    if (typeof errorCandidate.body === 'string') return errorCandidate.body;
    if (
      isRecord(errorCandidate.body) &&
      typeof (errorCandidate.body as Record<string, unknown>).message ===
        'string'
    ) {
      return (errorCandidate.body as Record<string, unknown>).message as string;
    }
  }
  return String(errorCandidate);
}

/**
 * Classify caught GitHub API, transport, or schema errors into typed metadata lookup failures.
 * WHY: Discriminating error causes allows callers to provide precise diagnostics
 * rather than uniformly treating all failures as missing metadata.
 * @param caughtError Caught error from fetch, JSON parsing, or Zod validation.
 * @param fallbackContext Descriptive context label included in error messages (e.g. "PR #123").
 * @returns Structured metadata lookup failure.
 */
export function classifyGithubError(
  caughtError: unknown,
  fallbackContext = 'GitHub metadata lookup',
): MetadataLookupFailure {
  const statusCode = extractHttpStatus(caughtError);

  if (statusCode !== undefined) {
    const errorMessage = extractErrorMessage(caughtError);
    const retryAfterSeconds = extractRetryAfterSeconds(caughtError);

    if (statusCode === 404) {
      return {
        status: 'not-found',
        message: `${fallbackContext} not found (404)`,
        statusCode: 404,
      };
    }

    if (statusCode === 401) {
      return {
        status: 'unauthenticated',
        message: `GitHub token unauthenticated (401): ${errorMessage}`,
        statusCode: 401,
      };
    }

    if (statusCode === 429 || statusCode === 403) {
      const bodyMessage =
        isRecord(caughtError) &&
        isRecord(caughtError.body) &&
        typeof (caughtError.body as Record<string, unknown>).message ===
          'string'
          ? ((caughtError.body as Record<string, unknown>).message as string)
          : '';
      const lowerCombinedMessage =
        `${errorMessage} ${bodyMessage}`.toLowerCase();

      // WHY: GitHub returns 403 for rate-limit breaches (both primary and secondary),
      // distinguishable from permission errors by message content in the status text or body.
      const isRateLimit =
        statusCode === 429 ||
        lowerCombinedMessage.includes('rate limit') ||
        lowerCombinedMessage.includes('secondary rate');

      if (isRateLimit) {
        return {
          status: 'rate-limited',
          message: `GitHub API rate limit exceeded: ${errorMessage}`,
          statusCode,
          retryAfter: retryAfterSeconds,
        };
      }
      return {
        status: 'unauthenticated',
        message: `GitHub API forbidden (403): ${errorMessage}`,
        statusCode: 403,
      };
    }

    return {
      status: 'network-error',
      message: `HTTP ${statusCode}: ${errorMessage}`,
      statusCode,
    };
  }

  const rawMessage = extractErrorMessage(caughtError);
  const isZodError =
    isRecord(caughtError) &&
    'name' in caughtError &&
    caughtError.name === 'ZodError';

  // WHY: Responses that pass HTTP transport but fail shape validation represent
  // API schema violations rather than connectivity drops.
  if (
    isZodError ||
    rawMessage.includes('JSON') ||
    rawMessage.includes('schema') ||
    rawMessage.includes('parse') ||
    rawMessage.includes('validation')
  ) {
    return {
      status: 'invalid-response',
      message: `Invalid response schema: ${rawMessage}`,
    };
  }

  const lowerRawMessage = rawMessage.toLowerCase();
  if (
    lowerRawMessage.includes('rate limit') ||
    lowerRawMessage.includes('secondary rate')
  ) {
    return {
      status: 'rate-limited',
      message: `GitHub API rate limit exceeded: ${rawMessage}`,
      retryAfter: extractRetryAfterSeconds(caughtError),
    };
  }

  return {
    status: 'network-error',
    message: `Network error: ${rawMessage}`,
  };
}

/**
 * Format a human-readable fallback reason for WHY extraction.
 * @param prNumber PR number associated with the lookup.
 * @param failure Typed failure detail.
 * @returns Formatted reason string.
 */
export function formatMetadataFallbackReason(
  prNumber: number,
  failure: MetadataLookupFailure,
): string {
  switch (failure.status) {
    case 'not-found':
      return `Skipped PR #${prNumber}: PR not found (404)`;
    case 'unauthenticated':
      return `Skipped PR #${prNumber}: GitHub authentication required or token invalid`;
    case 'rate-limited':
      return `Skipped PR #${prNumber}: GitHub API rate limit reached`;
    case 'invalid-response':
      return `Skipped PR #${prNumber}: invalid PR metadata received from GitHub`;
    case 'network-error':
      return `Skipped PR #${prNumber}: network error fetching PR metadata`;
    default:
      return `Skipped PR #${prNumber}: PR metadata lookup failed (${(failure as MetadataLookupFailure).message})`;
  }
}
