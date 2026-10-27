import { DomainError, type DomainErrorCode } from '@orbit/domain';
import type { ApiError } from '@orbit/shared';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const statusFor: Record<DomainErrorCode, ContentfulStatusCode> = {
  invalid_date_range: 400,
  invalid_party: 400,
  over_capacity: 422,
  not_found: 404,
  conflict: 409,
  invalid_transition: 409,
  invalid_input: 400,
  forbidden: 403,
};

export function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function notFound(c: Context, what: string) {
  return c.json(errorBody('not_found', `${what} not found`), 404);
}

export function handleError(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return c.json(errorBody('bad_request', err.message), err.status);
  }
  if (err instanceof DomainError) {
    return c.json(errorBody(err.code, err.message), statusFor[err.code]);
  }
  console.error(err);
  return c.json(errorBody('internal', 'Internal server error'), 500);
}
