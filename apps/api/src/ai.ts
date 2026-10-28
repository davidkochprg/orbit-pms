import { createMetaProvider, type MetaProvider } from '@orbit/ai';
import type { Env } from './env';

/** The Meta provider, or null when the key or agent model is not configured. */
export function createAi(env: Env): MetaProvider | null {
  if (!env.META_API_KEY || !env.META_MODEL_AGENT) return null;
  return createMetaProvider({
    apiKey: env.META_API_KEY,
    baseURL: env.META_API_BASE_URL,
    models: {
      agent: env.META_MODEL_AGENT,
      ...(env.META_MODEL_TRANSLATE ? { translate: env.META_MODEL_TRANSLATE } : {}),
      ...(env.META_MODEL_VOICE ? { voice: env.META_MODEL_VOICE } : {}),
      ...(env.META_MODEL_VISION ? { vision: env.META_MODEL_VISION } : {}),
    },
  });
}
