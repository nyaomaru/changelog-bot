/**
 * Centralized, typed error hierarchy with exit code mapping.
 * WHY: Provide actionable, consistent failures and predictable process exits.
 */

/** Base application error with optional exit code hint. */
export class AppError extends Error {
  /** Optional suggested process exit code. */
  readonly exitCode?: number;
  constructor(message: string, exitCode?: number) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

/** Misconfiguration or invalid CLI/env/config values. */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 64); // EX_USAGE
  }
}

/** Git interaction failures or invalid repository state. */
export class GitError extends AppError {
  constructor(message: string) {
    super(message, 65); // data error
  }
}

/** LLM provider/network/API problems. */
export class LlmError extends AppError {
  constructor(message: string) {
    super(message, 66);
  }
}

/** Output validation problems (schema mismatch). */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 67);
  }
}

/**
 * Map unknown errors to a stable process exit code.
 * @param error Arbitrary thrown value.
 * @returns Exit code to use with `process.exit`.
 */
export function mapErrorToExitCode(error: unknown): number {
  if (error instanceof AppError) return error.exitCode ?? 1;
  // Default nonzero exit code for untyped errors.
  return 1;
}

