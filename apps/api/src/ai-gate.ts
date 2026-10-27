import type { UsageStore } from '@orbit/ai';
import type { AiLimiter } from './limits';

const messages = {
  rate_limit: 'Demo limit reached: too many AI requests from your address. Try again in an hour.',
  token_budget: 'Demo limit reached for today. Try again tomorrow.',
  monthly_budget: 'The AI budget for this month is used up. The rest of Orbit keeps working.',
};

/** Returns a message to show if this AI call must not run, or null if it may. Counts the call. */
export type AiGate = (forwardedFor: string | undefined) => Promise<string | null>;

function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() || 'local';
}

export function createAiGate(deps: {
  limiter: AiLimiter;
  usage: UsageStore;
  monthlyBudgetMicroUsd: number;
  clock: () => Date;
}) {
  const withinBudget = async () =>
    (await deps.usage.monthToDateMicroUsd(deps.clock())) < deps.monthlyBudgetMicroUsd;
  const gate: AiGate = async (forwardedFor) => {
    if (!(await withinBudget())) return messages.monthly_budget;
    const limit = deps.limiter.check(clientIp(forwardedFor));
    return limit.ok ? null : messages[limit.reason];
  };
  return { gate, withinBudget };
}
