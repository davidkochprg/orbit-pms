import { describe, expect, it } from 'vitest';
import { createAiLimiter } from './limits';

describe('createAiLimiter', () => {
  it('limits calls per IP within a rolling hour', () => {
    let now = new Date('2026-10-27T10:00:00Z');
    const limiter = createAiLimiter({ perIpPerHour: 2, dailyTokenBudget: 1000 }, () => now);
    expect(limiter.check('a')).toEqual({ ok: true });
    expect(limiter.check('a')).toEqual({ ok: true });
    expect(limiter.check('a')).toEqual({ ok: false, reason: 'rate_limit' });
    expect(limiter.check('b')).toEqual({ ok: true });
    now = new Date('2026-10-27T11:00:01Z');
    expect(limiter.check('a')).toEqual({ ok: true });
  });

  it('stops everyone once the daily token budget is used, and resets the next day', () => {
    let now = new Date('2026-10-27T10:00:00Z');
    const limiter = createAiLimiter({ perIpPerHour: 100, dailyTokenBudget: 500 }, () => now);
    limiter.recordTokens(500);
    expect(limiter.check('a')).toEqual({ ok: false, reason: 'token_budget' });
    now = new Date('2026-10-28T00:00:01Z');
    expect(limiter.check('a')).toEqual({ ok: true });
  });
});
