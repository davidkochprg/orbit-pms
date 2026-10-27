import { z } from 'zod';

const optional = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))
  .optional();

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: optional,
  META_API_KEY: optional,
  META_API_BASE_URL: z.url().default('https://api.meta.ai/v1'),
  META_MODEL_AGENT: optional,
  META_MODEL_VOICE: optional,
  META_MODEL_VISION: optional,
  AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(500_000),
  AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),
});
export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
