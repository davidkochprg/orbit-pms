import { wrapLanguageModel } from 'ai';

type Model = ReturnType<typeof wrapLanguageModel>;

/** Thrown, and caught below, when the primary model answers with no text at all. */
class EmptyAnswerError extends Error {}

/**
 * A model that answers with `primary` and, if that call fails (out of credits, rate limited,
 * down) or comes back with no text, asks `fallback` with the same request. Only for
 * `generateText` with text output: streams are not retried.
 */
export function withFallback(
  primary: Model,
  fallback: Model,
  onFallback: (error: unknown) => void = (error) =>
    console.warn(`${primary.modelId} failed, using ${fallback.modelId}:`, error),
): Model {
  return wrapLanguageModel({
    model: primary,
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          const result = await doGenerate();
          const text = result.content.some((p) => p.type === 'text' && p.text.trim() !== '');
          if (!text) throw new EmptyAnswerError(`${primary.modelId} answered with no text`);
          return result;
        } catch (error) {
          if (params.abortSignal?.aborted) throw error;
          onFallback(error);
          return fallback.doGenerate(params);
        }
      },
    },
  });
}
