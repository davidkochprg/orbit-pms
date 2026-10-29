import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { withFallback } from './fallback';
import type { TranscriptionConfig } from './transcribe';

/** Muse Spark Open, Meta's open-weight model, on an OpenAI-compatible host such as Baseten. */
export interface OpenModelConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface MetaModelConfig {
  apiKey: string;
  baseURL: string;
  models: {
    agent: string;
    /** For translating messages and drafts; the agent model when unset. */
    translate?: string;
    voice?: string;
    vision?: string;
  };
  /** When set, reply drafts and translations run on Muse Spark Open, falling back to Meta's API. */
  open?: OpenModelConfig;
}

export interface MetaProvider {
  /** Text model for the agent loop and tool calling. */
  agent: LanguageModel;
  agentModelId: string;
  /** Model for translations: a cheaper one if configured, otherwise the agent model. */
  translate: LanguageModel;
  translateModelId: string;
  /** Model for inbox reply drafts: Muse Spark Open if configured, otherwise the agent model. */
  draft: LanguageModel;
  draftModelId: string;
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
  const agent = meta.chatModel(config.models.agent);
  const translateId = config.models.translate ?? config.models.agent;
  const translate = meta.chatModel(translateId);
  // Muse Spark Open has no structured output, so it takes only the plain-text features. Its host
  // gives no json_schema support, and it reasons at xhigh unless told otherwise (minimal → low).
  const open =
    config.open &&
    createOpenAICompatible({
      name: 'open',
      apiKey: config.open.apiKey,
      baseURL: config.open.baseURL,
      includeUsage: true,
    }).chatModel(config.open.model);
  return {
    agent,
    agentModelId: config.models.agent,
    translate: open ? withFallback(open, translate) : translate,
    translateModelId: config.open?.model ?? translateId,
    draft: open ? withFallback(open, agent) : agent,
    draftModelId: config.open?.model ?? config.models.agent,
    vision: config.models.vision ? meta.chatModel(config.models.vision) : null,
    visionModelId: config.models.vision ?? null,
    transcription: config.models.voice
      ? { apiKey: config.apiKey, baseURL: config.baseURL, model: config.models.voice }
      : null,
  };
}
