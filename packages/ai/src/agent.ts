import { isStepCount, type LanguageModel, type ModelMessage, streamText } from 'ai';
import { fromSdkUsage, type TokenUsage } from './cost';
import { type ReasoningEffort, reasoningEffort } from './reasoning';
import type { AgentTools } from './tools';

export interface AgentRunOptions {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  tools: AgentTools;
  /** Upper bound on model calls per user message (tool round-trips plus the final answer). */
  maxSteps?: number;
  /** Defaults to the agent's configured effort; evals override it to compare levels. */
  reasoning?: ReasoningEffort;
  abortSignal?: AbortSignal;
  /**
   * Called once per turn with the tokens used, also when the client disconnects midway. On abort
   * only completed steps are known; the step in flight is not reported by the provider.
   */
  onUsage?: (usage: TokenUsage) => void | Promise<void>;
}

function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (a, u) => ({
      input: a.input + u.input,
      cachedInput: a.cachedInput + u.cachedInput,
      output: a.output + u.output,
    }),
    { input: 0, cachedInput: 0, output: 0 },
  );
}

/**
 * One agent turn: the model may call tools several times before answering. Meta's Chat
 * Completions API only accepts `tool_choice: "auto"`, which is the SDK default.
 */
export function runAgent({
  model,
  system,
  messages,
  tools,
  maxSteps = 8,
  reasoning = reasoningEffort.agent,
  abortSignal,
  onUsage,
}: AgentRunOptions) {
  return streamText({
    model,
    system,
    messages,
    tools,
    reasoning,
    stopWhen: isStepCount(maxSteps),
    ...(abortSignal && { abortSignal }),
    onFinish: async ({ totalUsage }) => {
      await onUsage?.(fromSdkUsage(totalUsage));
    },
    onAbort: async ({ steps }) => {
      await onUsage?.(sumUsage(steps.map((s) => fromSdkUsage(s.usage))));
    },
  });
}
