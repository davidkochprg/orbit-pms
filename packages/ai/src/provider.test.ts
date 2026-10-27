import { describe, expect, it } from 'vitest';
import { createMetaProvider } from './provider';

describe('createMetaProvider', () => {
  it('builds models from configuration without calling the network', () => {
    const provider = createMetaProvider({
      apiKey: 'test-key',
      baseURL: 'https://example.invalid/v1',
      models: { agent: 'agent-model', vision: 'vision-model' },
    });
    expect(provider.agent).toMatchObject({ modelId: 'agent-model' });
    expect(provider.vision).toMatchObject({ modelId: 'vision-model' });
    expect(provider.voiceModelId).toBeNull();
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
