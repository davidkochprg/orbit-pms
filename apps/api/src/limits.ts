export interface AiLimitsConfig {
  perIpPerHour: number;
  dailyTokenBudget: number;
}

export type LimitCheck = { ok: true } | { ok: false; reason: 'rate_limit' | 'token_budget' };

/**
 * In-memory demo limits: agent calls per IP per rolling hour, and a global token budget per UTC
 * day. Resets when the server restarts, which is fine for a single demo instance.
 */
export function createAiLimiter(
  { perIpPerHour, dailyTokenBudget }: AiLimitsConfig,
  clock: () => Date,
) {
  const calls = new Map<string, number[]>();
  let day = '';
  let tokensToday = 0;

  function rollDay() {
    const today = clock().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      tokensToday = 0;
    }
  }

  return {
    /** Counts the call if allowed. */
    check(ip: string): LimitCheck {
      rollDay();
      if (tokensToday >= dailyTokenBudget) return { ok: false, reason: 'token_budget' };
      const cutoff = clock().getTime() - 3_600_000;
      const recent = (calls.get(ip) ?? []).filter((t) => t > cutoff);
      if (recent.length >= perIpPerHour) {
        calls.set(ip, recent);
        return { ok: false, reason: 'rate_limit' };
      }
      recent.push(clock().getTime());
      calls.set(ip, recent);
      return { ok: true };
    },
    recordTokens(tokens: number) {
      rollDay();
      tokensToday += tokens;
    },
  };
}

export type AiLimiter = ReturnType<typeof createAiLimiter>;
