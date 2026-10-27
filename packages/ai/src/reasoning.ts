import type { generateText } from 'ai';

export type ReasoningEffort = NonNullable<Parameters<typeof generateText>[0]['reasoning']>;

/**
 * Reasoning effort per feature, sent as Meta's `reasoning_effort`. Muse Spark always reasons
 * (it rejects "none") and bills reasoning tokens at the output rate, so each feature uses the
 * lowest level that keeps `pnpm eval` passing.
 */
export const reasoningEffort = {
  extraction: 'minimal',
  draft: 'minimal',
  housekeeping: 'minimal',
  agent: 'low',
} as const satisfies Record<string, ReasoningEffort>;
