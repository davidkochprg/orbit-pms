import type { AiFeature, UsageStore } from '@orbit/ai';
import { gte, sql, sum } from 'drizzle-orm';
import type { Db } from './client';
import { aiUsage } from './schema';

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface UsageByFeature {
  feature: AiFeature;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  costMicroUsd: number;
}

export function createUsageStore(db: Db): UsageStore & {
  monthToDateByFeature(now: Date): Promise<UsageByFeature[]>;
} {
  return {
    async record({ feature, model, tokens, audioSeconds, costMicroUsd }) {
      await db.insert(aiUsage).values({
        feature,
        model,
        inputTokens: tokens.input,
        cachedInputTokens: tokens.cachedInput,
        outputTokens: tokens.output,
        audioSeconds: Math.floor(audioSeconds),
        costMicroUsd,
      });
    },
    async monthToDateMicroUsd(now) {
      const [row] = await db
        .select({ total: sum(aiUsage.costMicroUsd) })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, monthStart(now)));
      return Number(row?.total ?? 0);
    },
    async monthToDateByFeature(now) {
      const rows = await db
        .select({
          feature: aiUsage.feature,
          calls: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
          cachedInputTokens: sql<number>`coalesce(sum(${aiUsage.cachedInputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
          audioSeconds: sql<number>`coalesce(sum(${aiUsage.audioSeconds}), 0)::int`,
          costMicroUsd: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, monthStart(now)))
        .groupBy(aiUsage.feature)
        .orderBy(aiUsage.feature);
      return rows.map((r) => ({ ...r, costMicroUsd: Number(r.costMicroUsd) }));
    },
  };
}
