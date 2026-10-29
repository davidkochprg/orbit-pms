import { wrapLanguageModel } from 'ai';

type Model = ReturnType<typeof wrapLanguageModel>;

/**
 * A model that answers with `primary` and, if that call fails (out of credits, rate limited,
 * down), asks `fallback` with the same request. Only for `generateText`: streams are not retried.
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
          return await doGenerate();
        } catch (error) {
          if (params.abortSignal?.aborted) throw error;
          onFallback(error);
          return fallback.doGenerate(params);
        }
      },
    },
  });
}
