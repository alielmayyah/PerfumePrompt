import type { ApiErrorBody } from './response.types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
    this.details = body.details;
  }
}

/**
 * Browser-side fetch wrapper.
 *
 * Turns the server error envelope back into a typed error, so components can show
 * the safe message the server chose and never have to guess at a fallback.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, {
      code: 'NETWORK_FAILED',
      message: 'Could not reach the server. Check your connection and try again.',
      retryable: true,
    });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text.length > 0 ? safeJson(text) : undefined;

  if (!response.ok) {
    const envelope = payload as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      envelope?.error ?? {
        code: 'INTERNAL',
        message: 'The request failed.',
        retryable: response.status >= 500,
      },
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<T>(path, { method: 'POST', body: form });
  },
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
