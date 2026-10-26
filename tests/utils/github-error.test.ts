import { describe, expect, test } from '@jest/globals';
import { z } from 'zod';
import type { HttpError } from '@/types/http.js';
import {
  classifyGithubError,
  formatMetadataFallbackReason,
} from '@/utils/github-error.js';

function createMockHttpError(
  statusCode: number,
  errorMessage: string,
  responseBody: unknown = {},
): HttpError {
  const httpError = new Error(errorMessage) as HttpError;
  httpError.status = statusCode;
  httpError.body = responseBody;
  return httpError;
}

describe('classifyGithubError', () => {
  test('classifies 404 as not-found with context label', () => {
    const errorCandidate = createMockHttpError(404, 'Not Found');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('classifies 401 as unauthenticated', () => {
    const errorCandidate = createMockHttpError(401, 'Bad credentials');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'unauthenticated',
      message: 'GitHub token unauthenticated (401): Bad credentials',
      statusCode: 401,
    });
  });

  test('classifies 403 as rate-limited when message mentions rate limit', () => {
    const errorCandidate = createMockHttpError(
      403,
      'API rate limit exceeded for user',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message:
        'GitHub API rate limit exceeded: API rate limit exceeded for user',
      statusCode: 403,
      retryAfter: undefined,
    });
  });

  test('classifies 403 secondary rate limit as rate-limited', () => {
    const errorCandidate = createMockHttpError(
      403,
      'You have exceeded a secondary rate limit',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message:
        'GitHub API rate limit exceeded: You have exceeded a secondary rate limit',
      statusCode: 403,
      retryAfter: undefined,
    });
  });

  test('classifies 403 without rate limit context as unauthenticated forbidden', () => {
    const errorCandidate = createMockHttpError(
      403,
      'Resource not accessible by integration',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'unauthenticated',
      message:
        'GitHub API forbidden (403): Resource not accessible by integration',
      statusCode: 403,
    });
  });

  test('classifies 429 as rate-limited and extracts retry_after when present', () => {
    const errorCandidate = createMockHttpError(429, 'Too Many Requests', {
      retry_after: 60,
    });
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Too Many Requests',
      statusCode: 429,
      retryAfter: 60,
    });
  });

  test('classifies non-rate-limit 5xx status as network-error with status code', () => {
    const errorCandidate = createMockHttpError(503, 'Service Unavailable');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'network-error',
      message: 'HTTP 503: Service Unavailable',
      statusCode: 503,
    });
  });

  test('classifies Zod schema validation errors as invalid-response', () => {
    const schema = z.object({ number: z.number() });
    const parseResult = schema.safeParse({ number: 'not-a-number' });
    expect(parseResult.success).toBe(false);

    if (!parseResult.success) {
      const failure = classifyGithubError(parseResult.error, 'PR #42');
      expect(failure.status).toBe('invalid-response');
      expect(failure.message).toContain('Invalid response schema');
    }
  });

  test('classifies JSON parsing failure as invalid-response', () => {
    const errorCandidate = new Error(
      'GitHub API failed to parse JSON response',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'invalid-response',
      message:
        'Invalid response schema: GitHub API failed to parse JSON response',
    });
  });

  test('classifies generic fetch or network failures as network-error', () => {
    const errorCandidate = new TypeError('fetch failed');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'network-error',
      message: 'Network error: fetch failed',
    });
  });

  test('classifies error object with status property but no message as not-found', () => {
    const errorCandidate = { status: 404 };
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('classifies error object with statusCode property as not-found', () => {
    const errorCandidate = { statusCode: 404, message: 'Not Found' };
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('classifies 403 as rate-limited when message is inside response body', () => {
    const errorCandidate = {
      status: 403,
      message: 'Forbidden',
      body: { message: 'API rate limit exceeded for user' },
    };
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Forbidden',
      statusCode: 403,
      retryAfter: undefined,
    });
  });

  test('extracts string retry_after or direct retryAfter', () => {
    const errorWithStringBodyRetry = {
      status: 429,
      message: 'Too Many Requests',
      body: { retry_after: '120' },
    };
    expect(classifyGithubError(errorWithStringBodyRetry, 'PR #42')).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Too Many Requests',
      statusCode: 429,
      retryAfter: 120,
    });

    const errorWithDirectRetry = {
      status: 429,
      message: 'Too Many Requests',
      retryAfter: '45',
    };
    expect(classifyGithubError(errorWithDirectRetry, 'PR #42')).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Too Many Requests',
      statusCode: 429,
      retryAfter: 45,
    });
  });

  test('classifies non-HTTP Error mentioning rate limit as rate-limited', () => {
    const errorCandidate = new Error('GitHub API rate limit exceeded');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: GitHub API rate limit exceeded',
      retryAfter: undefined,
    });
  });
});

describe('formatMetadataFallbackReason', () => {
  test('formats human-readable reason for not-found', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'not-found',
      message: 'Not found',
      statusCode: 404,
    });
    expect(reason).toBe('Skipped PR #10: PR not found (404)');
  });

  test('formats human-readable reason for unauthenticated', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'unauthenticated',
      message: 'Bad token',
      statusCode: 401,
    });
    expect(reason).toBe(
      'Skipped PR #10: GitHub authentication required or token invalid',
    );
  });

  test('formats human-readable reason for rate-limited', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'rate-limited',
      message: 'Rate limit',
      statusCode: 429,
    });
    expect(reason).toBe('Skipped PR #10: GitHub API rate limit reached');
  });

  test('formats human-readable reason for invalid-response', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'invalid-response',
      message: 'Schema violation',
    });
    expect(reason).toBe(
      'Skipped PR #10: invalid PR metadata received from GitHub',
    );
  });

  test('formats human-readable reason for network-error', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'network-error',
      message: 'Connection reset',
    });
    expect(reason).toBe('Skipped PR #10: network error fetching PR metadata');
  });

  test('throws error for unsupported failure status', () => {
    expect(() =>
      formatMetadataFallbackReason(10, {
        status: 'custom-status' as unknown as 'network-error',
        message: 'Something unexpected happened',
      }),
    ).toThrow('Unsupported metadata lookup failure status: custom-status');
  });
});
