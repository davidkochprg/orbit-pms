import {
  buildSystemPrompt,
  createAgentTools,
  type HotelContext,
  type MetaProvider,
  runAgent,
  tokenCostMicroUsd,
  type UsageStore,
} from '@orbit/ai';
import {
  type BillingService,
  HOTEL_TIMEZONE,
  hotelToday,
  type HotelService,
  type PendingActionService,
  type Repositories,
} from '@orbit/domain';
import { agentRequestSchema } from '@orbit/shared';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from 'ai';
import { Hono } from 'hono';
import { errorBody } from '../http';
import type { AiGate } from '../ai-gate';
import type { AiLimiter } from '../limits';
import { validate } from '../validate';

export interface AgentRouteDeps {
  ai: MetaProvider | null;
  repos: Repositories;
  hotel: HotelService;
  billing: BillingService;
  actions: PendingActionService;
  /** Read for every turn, so edits in Settings apply to the next message. */
  hotelContext: () => Promise<HotelContext>;
  limiter: AiLimiter;
  gate: AiGate;
  clock: () => Date;
  usage: UsageStore;
}

/** Only the most recent messages are sent, so long chats don't grow the cost of every turn. */
const MAX_HISTORY = 20;

/** `POST /api/agent`: streams one agent turn as an AI SDK UI message stream (SSE). */
export function agentRoutes({
  ai,
  repos,
  hotel,
  billing,
  actions,
  hotelContext,
  limiter,
  clock,
  usage,
  gate,
}: AgentRouteDeps) {
  const tools = createAgentTools({
    hotel,
    billing,
    actions,
    listRooms: () => repos.rooms.listRooms(),
  });

  return new Hono().post('/agent', validate('json', agentRequestSchema), async (c) => {
    if (!ai) {
      return c.json(
        errorBody('ai_not_configured', 'The AI agent is not configured on this server.'),
        503,
      );
    }
    const blocked = await gate(c.req.header('x-forwarded-for'));
    if (blocked) return c.json(errorBody('demo_limit', blocked), 429);

    let messages: UIMessage[];
    try {
      messages = await validateUIMessages({ messages: c.req.valid('json').messages, tools });
    } catch (err) {
      return c.json(
        errorBody('invalid_messages', err instanceof Error ? err.message : 'Invalid messages'),
        400,
      );
    }

    const result = runAgent({
      model: ai.agent,
      system: buildSystemPrompt({
        hotel: await hotelContext(),
        today: hotelToday(clock()),
        timezone: HOTEL_TIMEZONE,
      }),
      messages: await convertToModelMessages(messages.slice(-MAX_HISTORY), { tools }),
      tools,
      abortSignal: c.req.raw.signal,
      onUsage: async (tokens) => {
        limiter.recordTokens(tokens.input + tokens.output);
        await usage.record({
          feature: 'agent',
          model: ai.agentModelId,
          tokens,
          audioSeconds: 0,
          costMicroUsd: tokenCostMicroUsd(tokens),
        });
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        tools,
        originalMessages: messages,
        onError: () => 'The agent hit an error. Please try again.',
      }),
    });
  });
}
