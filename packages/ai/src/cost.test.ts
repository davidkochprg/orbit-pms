import { describe, expect, it } from 'vitest';
import { audioCostMicroUsd, fromSdkUsage, tokenCostMicroUsd } from './cost';

describe('tokenCostMicroUsd', () => {
  it('prices uncached input, cached input and output separately', () => {
    // 1M uncached input = $1.25, 1M cached = $0.15, 1M output = $4.25.
    expect(tokenCostMicroUsd({ input: 1_000_000, cachedInput: 0, output: 0 })).toBe(1_250_000);
    expect(tokenCostMicroUsd({ input: 1_000_000, cachedInput: 1_000_000, output: 0 })).toBe(
      150_000,
    );
    expect(tokenCostMicroUsd({ input: 0, cachedInput: 0, output: 1_000_000 })).toBe(4_250_000);
  });

  it('prices a typical inbox extraction at well under a cent', () => {
    const cost = tokenCostMicroUsd({ input: 1500, cachedInput: 1000, output: 300 });
    expect(cost).toBe(Math.round(500 * 1.25 + 1000 * 0.15 + 300 * 4.25));
    expect(cost).toBeLessThan(10_000);
  });
});

describe('audioCostMicroUsd', () => {
  it('bills whole seconds at $0.18 per hour', () => {
    expect(audioCostMicroUsd(3600)).toBe(180_000);
    expect(audioCostMicroUsd(10.9)).toBe(500);
  });
});

describe('fromSdkUsage', () => {
  it('reads cache hits from the SDK usage', () => {
    expect(
      fromSdkUsage({
        inputTokens: 100,
        inputTokenDetails: { noCacheTokens: 40, cacheReadTokens: 60, cacheWriteTokens: undefined },
        outputTokens: 20,
        outputTokenDetails: { textTokens: 20, reasoningTokens: undefined },
        totalTokens: 120,
      }),
    ).toEqual({ input: 100, cachedInput: 60, output: 20 });
  });
});
