/**
 * Shared error envelope shape.
 *
 * Split out of `response.ts` because that module is `server-only`, and the browser
 * client needs the type without pulling the server implementation into the bundle.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    retryable: boolean;
  };
}
