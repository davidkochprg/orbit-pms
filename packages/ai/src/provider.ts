import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { TranscriptionConfig } from './transcribe';

export interface MetaModelConfig {
  apiKey: string;
  baseURL: string;
  models: {
    agent: string;
    voice?: string;
    vision?: string;
  };
}

export interface MetaProvider {
  /** Text model for the agent loop and tool calling. */
  agent: LanguageModel;
  agentModelId: string;
  /** Vision-capable chat model for ID scans, if configured. */
  vision: LanguageModel | null;
  visionModelId: string | null;
  /** Speech-to-text settings, if a voice model is configured. */
  transcription: TranscriptionConfig | null;
}

/**
 * The Meta Model API is OpenAI-compatible, so it is reached through the AI SDK's
 * OpenAI-compatible provider. All IDs and the base URL come from configuration.
 */
export function createMetaProvider(config: MetaModelConfig): MetaProvider {
  const meta = createOpenAICompatible({
    name: 'meta',
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    includeUsage: true,
    // Meta supports response_format json_schema, so structured output is constrained server-side.
    supportsStructuredOutputs: true,
  });
  return {
    agent: meta.chatModel(config.models.agent),
    agentModelId: config.models.agent,
    vision: config.models.vision ? meta.chatModel(config.models.vision) : null,
    visionModelId: config.models.vision ?? null,
    transcription: config.models.voice
      ? { apiKey: config.apiKey, baseURL: config.baseURL, model: config.models.voice }
      : null,
  };
}
