/**
 * Error taxonomy.
 *
 * Every failure surfaced to a client goes through `AppError` so that route handlers
 * can map to an HTTP status and a *safe* message without ever echoing a raw provider
 * error (which may contain keys, prompts or internal URLs).
 */

export type AppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNSUPPORTED_MEDIA'
  | 'PAYLOAD_TOO_LARGE'
  | 'STORAGE_FAILED'
  | 'DATABASE_FAILED'
  | 'SEARCH_BLOCKED'
  | 'NETWORK_FAILED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNSUPPORTED_MEDIA: 415,
  PAYLOAD_TOO_LARGE: 413,
  STORAGE_FAILED: 502,
  DATABASE_FAILED: 502,
  SEARCH_BLOCKED: 503,
  NETWORK_FAILED: 502,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  /** Structured detail safe to show the user (e.g. field-level validation issues). */
  details?: unknown;
  /** Original error, kept server-side for logging only. */
  cause?: unknown;
  /** Whether the caller may reasonably retry the same request. */
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
  }
}

const RETRYABLE_CODES = new Set<AppErrorCode>([
  'SEARCH_BLOCKED',
  'NETWORK_FAILED',
  'STORAGE_FAILED',
]);

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export const errors = {
  validation: (message: string, details?: unknown) =>
    new AppError('VALIDATION', message, { details }),
  notFound: (what: string) => new AppError('NOT_FOUND', `${what} not found`),
  conflict: (message: string) => new AppError('CONFLICT', message),
  unsupportedMedia: (message: string) => new AppError('UNSUPPORTED_MEDIA', message),
  tooLarge: (message: string) => new AppError('PAYLOAD_TOO_LARGE', message),
  internal: (cause?: unknown) =>
    new AppError('INTERNAL', 'Something went wrong. Please try again.', { cause }),
};

/**
 * Normalises an unknown thrown value into an `AppError`, deliberately discarding the
 * original message so a scraped page or a library internal cannot leak to a client.
 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  return errors.internal(value);
}
