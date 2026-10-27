import { isStepCount, type LanguageModel, type ModelMessage, streamText } from 'ai';
import type { AgentTools } from './tools';

export interface AgentRunOptions {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  tools: AgentTools;
  /** Upper bound on model calls per user message (tool round-trips plus the final answer). */
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onFinish?: (usage: { totalTokens: number }) => void | Promise<void>;
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
  abortSignal,
  onFinish,
}: AgentRunOptions) {
  return streamText({
    model,
    system,
    messages,
    tools,
    stopWhen: isStepCount(maxSteps),
    ...(abortSignal && { abortSignal }),
    onFinish: async ({ totalUsage }) => {
      await onFinish?.({ totalTokens: totalUsage.totalTokens ?? 0 });
    },
  });
}
