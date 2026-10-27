import {
  buildSystemPrompt,
  createAgentTools,
  hotelProfile,
  type MetaProvider,
  runAgent,
} from '@orbit/ai';
import {
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
import type { AiLimiter } from '../limits';
import { validate } from '../validate';

export interface AgentRouteDeps {
  ai: MetaProvider | null;
  repos: Repositories;
  hotel: HotelService;
  actions: PendingActionService;
  limiter: AiLimiter;
  clock: () => Date;
}

const limitMessages = {
  rate_limit:
    'Demo limit reached: too many agent requests from your address. Try again in an hour.',
  token_budget: 'Demo limit reached for today. Try again tomorrow.',
};

function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() || 'local';
}

/** `POST /api/agent`: streams one agent turn as an AI SDK UI message stream (SSE). */
export function agentRoutes({ ai, repos, hotel, actions, limiter, clock }: AgentRouteDeps) {
  const tools = createAgentTools({ hotel, actions, listRooms: () => repos.rooms.listRooms() });

  return new Hono().post('/agent', validate('json', agentRequestSchema), async (c) => {
    if (!ai) {
      return c.json(
        errorBody('ai_not_configured', 'The AI agent is not configured on this server.'),
        503,
      );
    }
    const limit = limiter.check(clientIp(c.req.header('x-forwarded-for')));
    if (!limit.ok) return c.json(errorBody('demo_limit', limitMessages[limit.reason]), 429);

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
        hotel: hotelProfile,
        today: hotelToday(clock()),
        timezone: HOTEL_TIMEZONE,
      }),
      messages: await convertToModelMessages(messages, { tools }),
      tools,
      abortSignal: c.req.raw.signal,
      onFinish: ({ totalTokens }) => limiter.recordTokens(totalTokens),
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
