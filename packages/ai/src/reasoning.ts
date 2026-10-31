import type { generateText } from 'ai';

export type ReasoningEffort = NonNullable<Parameters<typeof generateText>[0]['reasoning']>;

/**
 * Reasoning effort per feature, sent as Meta's `reasoning_effort`. Muse Spark always reasons
 * (it rejects "none") and bills reasoning tokens at the output rate, so each feature uses the
 * lowest level that keeps `pnpm eval` passing. The rate review is the exception: it weighs
 * messages, holidays and sixty nights together, runs only when the outlook changes, and gains
 * most from thinking longer.
 */
export const reasoningEffort = {
  extraction: 'minimal',
  draft: 'minimal',
  housekeeping: 'minimal',
  stayNotes: 'minimal',
  revenueBrief: 'minimal',
  reportSummary: 'minimal',
  guestMemory: 'minimal',
  rateReview: 'high',
  idScan: 'minimal',
  translate: 'minimal',
  learn: 'minimal',
  knowledge: 'minimal',
  repairs: 'minimal',
  agent: 'low',
} as const satisfies Record<string, ReasoningEffort>;
