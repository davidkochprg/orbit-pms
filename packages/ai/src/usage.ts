import type { TokenUsage } from './cost';

export const aiFeatures = [
  'agent',
  'inbox_extract',
  'inbox_draft',
  'translate',
  'id_scan',
  'voice',
  'brief',
  'stay_notes',
  'rate_brief',
] as const;
export type AiFeature = (typeof aiFeatures)[number];

export interface UsageRecord {
  feature: AiFeature;
  model: string;
  tokens: TokenUsage;
  audioSeconds: number;
  costMicroUsd: number;
}

/** Persists model usage so real spend can be shown and capped. Implemented in packages/db. */
export interface UsageStore {
  record(entry: UsageRecord): Promise<void>;
  /** Total cost since the start of the UTC month containing `now`. */
  monthToDateMicroUsd(now: Date): Promise<number>;
}
