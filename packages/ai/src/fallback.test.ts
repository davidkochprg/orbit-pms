import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { withFallback } from './fallback';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function model(id: string, reply: () => string) {
  return new MockLanguageModelV4({
    modelId: id,
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: reply() }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
        response: { modelId: id },
      }),
  });
}

describe('withFallback', () => {
  it('answers with the primary model when it works', async () => {
    const fallback = model('meta', () => 'from meta');
    const result = await generateText({
      model: withFallback(
        model('open', () => 'from open'),
        fallback,
        () => {},
      ),
      prompt: 'hi',
    });
    expect(result.text).toBe('from open');
    expect(result.response.modelId).toBe('open');
    expect(fallback.doGenerateCalls).toHaveLength(0);
  });

  it('asks the fallback with the same request when the primary fails', async () => {
    const onFallback = vi.fn();
    const primary = model('open', () => {
      throw new Error('402 out of credits');
    });
    const fallback = model('meta', () => 'from meta');
    const result = await generateText({
      model: withFallback(primary, fallback, onFallback),
      prompt: 'hi',
      maxRetries: 0,
    });
    expect(result.text).toBe('from meta');
    expect(result.response.modelId).toBe('meta');
    expect(onFallback).toHaveBeenCalledOnce();
    expect(fallback.doGenerateCalls[0]?.prompt).toEqual(primary.doGenerateCalls[0]?.prompt);
  });

  it('asks the fallback when the primary answers with no text', async () => {
    const onFallback = vi.fn();
    const result = await generateText({
      model: withFallback(
        model('open', () => '  '),
        model('meta', () => 'from meta'),
        onFallback,
      ),
      prompt: 'hi',
      maxRetries: 0,
    });
    expect(result.text).toBe('from meta');
    expect(onFallback).toHaveBeenCalledOnce();
  });
});
