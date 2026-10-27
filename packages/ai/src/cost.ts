import type { LanguageModelUsage } from 'ai';

/**
 * Meta Model API list prices in USD, Standard tier, from dev.meta.ai/docs/pricing-rate-limits
 * (checked 2026-10-27). Contributor tier is cheaper but lets Meta train on prompts and outputs,
 * so it must not be used with real guest data.
 */
export const metaPricing = {
  perMillionTokens: { input: 1.25, cachedInput: 0.15, output: 4.25 },
  voicePerAudioHour: 0.18,
} as const;

export interface TokenUsage {
  /** All prompt tokens, including cached ones. */
  input: number;
  /** The part of `input` served from Meta's prompt cache. */
  cachedInput: number;
  output: number;
}

export function fromSdkUsage(usage: LanguageModelUsage): TokenUsage {
  return {
    input: usage.inputTokens ?? 0,
    cachedInput: usage.inputTokenDetails.cacheReadTokens ?? 0,
    output: usage.outputTokens ?? 0,
  };
}

/** Cost in micro-dollars (1e-6 USD), an integer so totals stay exact. */
export function tokenCostMicroUsd({ input, cachedInput, output }: TokenUsage): number {
  const p = metaPricing.perMillionTokens;
  const uncached = Math.max(input - cachedInput, 0);
  // Price per million tokens equals micro-dollars per token.
  return Math.round(uncached * p.input + cachedInput * p.cachedInput + output * p.output);
}

export function audioCostMicroUsd(seconds: number): number {
  return Math.round((Math.floor(seconds) / 3600) * metaPricing.voicePerAudioHour * 1_000_000);
}
