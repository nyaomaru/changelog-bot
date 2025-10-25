/**
 * Error type for HTTP requests that includes status code and parsed body.
 * WHY: Useful across providers and other network calls for consistent error handling.
 */
export interface HttpError extends Error {
  /** HTTP status code. */
  status: number;
  /** Parsed error body when possible; raw text otherwise. */
  body: unknown;
}
