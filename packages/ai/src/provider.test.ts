import { describe, expect, it } from 'vitest';
import { createMetaProvider, fetchWithTimeout } from './provider';

describe('createMetaProvider', () => {
  it('builds models from configuration without calling the network', () => {
    const provider = createMetaProvider({
      apiKey: 'test-key',
      baseURL: 'https://example.invalid/v1',
      models: { agent: 'agent-model', vision: 'vision-model' },
    });
    expect(provider.agent).toMatchObject({ modelId: 'agent-model' });
    expect(provider.vision).toMatchObject({ modelId: 'vision-model' });
    expect(provider.transcription).toBeNull();
  });

  it('carries the speech-to-text settings when a voice model is set', () => {
    const provider = createMetaProvider({
      apiKey: 'k',
      baseURL: 'https://example.invalid/v1',
      models: { agent: 'a', voice: 'voice-model' },
    });
    expect(provider.transcription).toEqual({
      apiKey: 'k',
      baseURL: 'https://example.invalid/v1',
      model: 'voice-model',
    });
  });

  it('drafts and translates with the agent model when Muse Spark Open is not set', () => {
    const provider = createMetaProvider({
      apiKey: 'k',
      baseURL: 'https://example.invalid/v1',
      models: { agent: 'a', translate: 't' },
    });
    expect(provider.draftModelId).toBe('a');
    expect(provider.translateModelId).toBe('t');
    expect(provider.draft).toBe(provider.agent);
  });

  it('drafts and translates with Muse Spark Open when set, keeping the agent on Meta', () => {
    const provider = createMetaProvider({
      apiKey: 'k',
      baseURL: 'https://example.invalid/v1',
      models: { agent: 'a' },
      open: {
        apiKey: 'o',
        baseURL: 'https://open.invalid/v1',
        model: 'meta-models/muse-spark-open',
      },
    });
    expect(provider.agentModelId).toBe('a');
    expect(provider.draftModelId).toBe('meta-models/muse-spark-open');
    expect(provider.translateModelId).toBe('meta-models/muse-spark-open');
    expect(provider.draft).toMatchObject({ modelId: 'meta-models/muse-spark-open' });
    expect(provider.translate).toMatchObject({ modelId: 'meta-models/muse-spark-open' });
  });

  it('leaves optional models unset', () => {
    const provider = createMetaProvider({
      apiKey: 'k',
      baseURL: 'https://example.invalid/v1',
      models: { agent: 'a' },
    });
    expect(provider.vision).toBeNull();
  });
});

describe('fetchWithTimeout', () => {
  /** A request that only ends when it is aborted. */
  const hanging: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => reject(signal.reason as Error));
    });

  it('gives up on a request that takes too long', async () => {
    await expect(fetchWithTimeout(10, hanging)('https://example.invalid')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('still stops when the caller aborts', async () => {
    const caller = new AbortController();
    const request = fetchWithTimeout(60_000, hanging)('https://example.invalid', {
      signal: caller.signal,
    });
    caller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes a quick response through', async () => {
    const ok: typeof fetch = () => Promise.resolve(new Response('ok'));
    const res = await fetchWithTimeout(1000, ok)('https://example.invalid');
    expect(await res.text()).toBe('ok');
  });
});
