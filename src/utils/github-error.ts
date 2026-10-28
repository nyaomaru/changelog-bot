import type { MetadataLookupFailure } from '@/types/github.js';
import {
  isError,
  isNumber,
  isRecord,
  isSafeInteger,
  isString,
} from '@/utils/is.js';

function extractHttpStatus(errorCandidate: unknown): number | undefined {
  if (!isRecord(errorCandidate)) return undefined;
  if (isSafeInteger(errorCandidate.status)) {
    return errorCandidate.status;
  }
  if (isSafeInteger(errorCandidate.statusCode)) {
    return errorCandidate.statusCode;
  }
  return undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (isNumber(value) && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (isString(value)) {
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
    const bodyCandidate = errorCandidate.body;
    const bodyRetryAfter =
      bodyCandidate.retry_after ?? bodyCandidate.retryAfter;
    return parsePositiveNumber(bodyRetryAfter);
  }

  return undefined;
}

function extractErrorMessage(errorCandidate: unknown): string {
  if (isError(errorCandidate)) return errorCandidate.message;
  if (isRecord(errorCandidate)) {
    if (isString(errorCandidate.message)) return errorCandidate.message;
    if (isString(errorCandidate.body)) return errorCandidate.body;
    if (
      isRecord(errorCandidate.body) &&
      isString(errorCandidate.body.message)
    ) {
      return errorCandidate.body.message;
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
        isString(caughtError.body.message)
          ? caughtError.body.message
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
    default: {
      const exhaustiveStatus: never = failure.status;
      throw new Error(
        `Unsupported metadata lookup failure status: ${String(exhaustiveStatus)}`,
      );
    }
  }
}

/**
 * Format a human-readable fallback reason when commit-to-PR metadata lookups degrade.
 * @param commitSha Commit SHA associated with the failed lookup.
 * @param failure Typed failure detail.
 * @returns Formatted reason string.
 */
export function formatCommitMetadataFallbackReason(
  commitSha: string,
  failure: MetadataLookupFailure,
): string {
  const shortSha = commitSha.slice(0, 7);
  switch (failure.status) {
    case 'not-found':
      return `Commit ${shortSha}: commit pulls not found (404)`;
    case 'unauthenticated':
      return `Commit ${shortSha}: GitHub authentication required or token invalid`;
    case 'rate-limited':
      return `Commit ${shortSha}: GitHub API rate limit reached`;
    case 'invalid-response':
      return `Commit ${shortSha}: invalid commit PR metadata received from GitHub`;
    case 'network-error':
      return `Commit ${shortSha}: network error fetching commit PR metadata`;
    default: {
      const exhaustiveStatus: never = failure.status;
      throw new Error(
        `Unsupported metadata lookup failure status: ${String(exhaustiveStatus)}`,
      );
    }
  }
}

/**
 * Format a human-readable fallback reason when release body metadata lookups degrade.
 * @param releaseTag Release tag associated with the failed lookup.
 * @param failure Typed failure detail.
 * @returns Formatted reason string.
 */
export function formatReleaseMetadataFallbackReason(
  releaseTag: string,
  failure: MetadataLookupFailure,
): string {
  switch (failure.status) {
    case 'not-found':
      return `Release ${releaseTag}: release notes not found (404)`;
    case 'unauthenticated':
      return `Release ${releaseTag}: GitHub authentication required or token invalid`;
    case 'rate-limited':
      return `Release ${releaseTag}: GitHub API rate limit reached`;
    case 'invalid-response':
      return `Release ${releaseTag}: invalid release notes metadata received from GitHub`;
    case 'network-error':
      return `Release ${releaseTag}: network error fetching release notes`;
    default: {
      const exhaustiveStatus: never = failure.status;
      throw new Error(
        `Unsupported metadata lookup failure status: ${String(exhaustiveStatus)}`,
      );
    }
  }
}
