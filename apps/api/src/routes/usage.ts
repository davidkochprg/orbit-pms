import type { UsageStore } from '@orbit/ai';
import type { AiUsageSummary } from '@orbit/shared';
import { Hono } from 'hono';

export type UsageReport = (now: Date) => Promise<AiUsageSummary['byFeature']>;

export interface UsageRouteDeps {
  usage: UsageStore & { monthToDateByFeature?: UsageReport };
  monthlyBudgetMicroUsd: number;
  clock: () => Date;
}

/** `GET /api/ai-usage`: real Meta spend this month against the budget. */
export function usageRoutes({ usage, monthlyBudgetMicroUsd, clock }: UsageRouteDeps) {
  return new Hono().get('/ai-usage', async (c) => {
    const now = clock();
    return c.json<AiUsageSummary>({
      month: now.toISOString().slice(0, 7),
      budgetMicroUsd: monthlyBudgetMicroUsd,
      spentMicroUsd: await usage.monthToDateMicroUsd(now),
      byFeature: (await usage.monthToDateByFeature?.(now)) ?? [],
    });
  });
}
