import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { errorBody } from './http';

/** zod validation with the API's error shape: `400 { error: { code: 'invalid_<target>' } }`. */
export function validate<T extends keyof ValidationTargets, S extends z.ZodType>(
  target: T,
  schema: S,
) {
  return zValidator(target, schema, (result, c) =>
    result.success
      ? undefined
      : c.json(
          errorBody(
            `invalid_${target}`,
            result.error.issues
              .map((i) => `${i.path.join('.') || target}: ${i.message}`)
              .join('; '),
          ),
          400,
        ),
  );
}
