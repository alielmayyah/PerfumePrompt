import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AppError, errors, toAppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import type { ApiErrorBody } from './response.types';

const log = createLogger('api');

export type { ApiErrorBody };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Maps any thrown value to a safe HTTP response.
 *
 * Only `AppError` messages reach the client. Anything else is logged server-side
 * and replaced with a generic message, so provider errors, stack traces, keys and
 * internal URLs can never leak.
 */
export function fail(error: unknown): NextResponse<ApiErrorBody> {
  const appError = toAppError(error);
  if (appError.status >= 500 || appError.code === 'INTERNAL') {
    log.error('request failed', {
      code: appError.code,
      message: appError.message,
      cause: appError.cause instanceof Error ? appError.cause.message : undefined,
    });
  } else {
    log.warn('request rejected', { code: appError.code, message: appError.message });
  }

  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined ? { details: appError.details } : {}),
        retryable: appError.retryable,
      },
    },
    { status: appError.status },
  );
}

/** Wraps a handler so every route shares the same error mapping. */
export function handler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

/** Parses and validates a JSON body, converting zod issues into a 400. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw errors.validation('Expected a JSON request body.');
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw errors.validation('The request body is invalid.', formatIssues(result.error));
  }
  return result.data;
}

export function parseQuery<T extends z.ZodType>(request: Request, schema: T): z.output<T> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw errors.validation('The query parameters are invalid.', formatIssues(result.error));
  }
  return result.data;
}

function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 8).map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export { AppError };
