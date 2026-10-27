import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { runAgent } from './agent';
import { setup } from './test-setup';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function toolCallStep(toolName: string, input: unknown) {
  return {
    stream: simulateReadableStream({
      chunks: [
        {
          type: 'tool-call' as const,
          toolCallId: `call_${toolName}`,
          toolName,
          input: JSON.stringify(input),
        },
        {
          type: 'finish' as const,
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage,
        },
      ],
    }),
  };
}

function textStep(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start' as const, id: 't' },
        { type: 'text-delta' as const, id: 't', delta: text },
        { type: 'text-end' as const, id: 't' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage,
        },
      ],
    }),
  };
}

describe('runAgent', () => {
  it('runs read tools, proposes a change and answers, without mutating anything', async () => {
    const { tools, repos } = setup();
    const steps = [
      toolCallStep('searchBookings', { guestName: 'Novák' }),
      toolCallStep('moveBooking', { bookingId: 'bk_1', roomId: 'rm_201' }),
      textStep('I prepared moving Tomáš Novák to room 201. Please confirm.'),
    ];
    let call = 0;
    const model = new MockLanguageModelV4({ doStream: () => Promise.resolve(steps[call++]!) });
    let tokens = 0;

    const result = runAgent({
      model,
      system: 'test',
      messages: [{ role: 'user', content: 'Move Novák to room 201' }],
      tools,
      onFinish: ({ totalTokens }) => {
        tokens = totalTokens;
      },
    });

    expect(await result.text).toBe('I prepared moving Tomáš Novák to room 201. Please confirm.');
    const toolResults = (await result.steps).flatMap((s) => s.toolResults);
    expect(toolResults.map((r) => r.toolName)).toEqual(['searchBookings', 'moveBooking']);
    expect(toolResults[1]?.output).toMatchObject({ status: 'awaiting_confirmation' });
    expect(repos.state.bookings[0]?.roomId).toBe('rm_104');
    expect(repos.state.pendingActions).toHaveLength(1);
    expect(tokens).toBe(45);
  });

  it('stops after maxSteps even if the model keeps calling tools', async () => {
    const { tools } = setup();
    const model = new MockLanguageModelV4({
      doStream: () => Promise.resolve(toolCallStep('listRooms', {})),
    });
    const result = runAgent({
      model,
      system: 'test',
      messages: [{ role: 'user', content: 'loop' }],
      tools,
      maxSteps: 3,
    });
    expect((await result.steps).length).toBe(3);
  });
});
