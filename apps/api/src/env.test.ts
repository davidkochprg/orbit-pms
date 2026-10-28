import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults for an empty environment', () => {
    expect(parseEnv({})).toEqual({
      PORT: 3001,
      META_API_BASE_URL: 'https://api.meta.ai/v1',
      AI_DAILY_TOKEN_BUDGET: 2_000_000,
      AI_RATE_LIMIT_PER_HOUR: 20,
      AI_MONTHLY_BUDGET_USD: 100,
      HOTEL_TIMEZONE: 'America/Los_Angeles',
    });
  });

  it('treats empty strings as unset', () => {
    expect(parseEnv({ META_API_KEY: '', DATABASE_URL: ' ' }).META_API_KEY).toBeUndefined();
  });

  it('coerces numbers and rejects bad values', () => {
    expect(parseEnv({ PORT: '4000' }).PORT).toBe(4000);
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => parseEnv({ META_API_BASE_URL: 'not a url' })).toThrow(/META_API_BASE_URL/);
  });
});
