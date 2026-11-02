import { describe, expect, it } from 'vitest';
import {
  agentErrorMessage,
  asProposal,
  asToolError,
  proposalGroups,
  orbStateFor,
  suggestedQuestionsFor,
  toolLabel,
  toolResultSummary,
} from './agent';

describe('agent helpers', () => {
  it('recognises proposal tool output', () => {
    const output = { pendingActionId: 'act_1', summary: 'Move', status: 'awaiting_confirmation' };
    expect(asProposal(output)).toEqual(output);
    expect(asProposal({ rooms: [] })).toBeNull();
  });

  it('extracts tool error messages', () => {
    expect(asToolError({ error: { code: 'conflict', message: 'Room 2 is taken' } })).toBe(
      'Room 2 is taken',
    );
    expect(asToolError([1, 2])).toBeNull();
  });

  it('shows API error messages such as AI being off', () => {
    const body = JSON.stringify({
      error: { code: 'ai_not_configured', message: 'The agent is not configured.' },
    });
    expect(agentErrorMessage(new Error(body))).toBe('The agent is not configured.');
    expect(agentErrorMessage(new Error('socket hang up'))).toMatch(/unavailable/);
  });

  it('describes tool steps in plain language', () => {
    expect(toolLabel('checkAvailability', false)).toBe('Checking availability');
    expect(toolLabel('checkAvailability', true)).toBe('Checked availability');
    expect(toolLabel('somethingNew', true)).toBe('Ran somethingNew');
  });

  it('sums up a finished step in a few words', () => {
    expect(toolResultSummary('getArrivals', [{}, {}])).toBe('2 guests');
    expect(toolResultSummary('searchBookings', [])).toBe('No bookings');
    expect(toolResultSummary('quote', { total: 4500 })).toBe('$4,500');
    expect(toolResultSummary('getBill', { balance: -200 })).toBe('$200 owed back');
    expect(toolResultSummary('getGuestBook', { partySize: 3, missing: 1 })).toBe('1 ID missing');
    expect(
      toolResultSummary('setRoomStatus', { done: true, roomName: '103', status: 'out_of_order' }),
    ).toBe('Room 103 now out of order');
    expect(
      toolResultSummary('removeCharge', {
        pendingActionId: 'act_1',
        summary: 'Remove …',
        status: 'awaiting_confirmation',
      }),
    ).toBe('Waiting for your confirmation');
    expect(toolResultSummary('getBooking', { error: { code: 'not_found', message: 'Gone' } })).toBe(
      'Gone',
    );
    expect(toolResultSummary('getBooking', { nothing: true })).toBe(null);
  });

  it('moves the orb by what the step does', () => {
    expect(orbStateFor('getArrivals')).toBe('searching');
    expect(orbStateFor('checkAvailability')).toBe('searching');
    expect(orbStateFor('quote')).toBe('solving');
    expect(orbStateFor('removeCharge')).toBe('weaving');
    expect(orbStateFor('setRoomStatus')).toBe('weaving');
  });
});

describe('proposalGroups', () => {
  it('groups the changes the agent proposed by answer, oldest first, skipping other results', () => {
    const proposal = (id: string) => ({
      type: 'tool-addCharge' as const,
      toolCallId: `call_${id}`,
      state: 'output-available' as const,
      input: {},
      output: { pendingActionId: id, summary: 'Add', status: 'awaiting_confirmation' },
    });
    const messages = [
      { id: 'u1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Add two' }] },
      {
        id: 'a1',
        role: 'assistant' as const,
        parts: [
          {
            type: 'tool-getBill' as const,
            toolCallId: 'call_bill',
            state: 'output-available' as const,
            input: {},
            output: { balance: 0 },
          },
          proposal('act_1'),
          proposal('act_2'),
        ],
      },
    ];
    expect(proposalGroups(messages)).toEqual([['act_1', 'act_2']]);
    const later = {
      id: 'a2',
      role: 'assistant' as const,
      parts: [proposal('act_3')],
    };
    expect(proposalGroups([...messages, later])).toEqual([['act_1', 'act_2'], ['act_3']]);
  });
});

describe('suggestedQuestionsFor', () => {
  it('asks about what is open first, then about the page, then in general', () => {
    expect(suggestedQuestionsFor('/housekeeping', { kind: 'repair', id: 'hk_1' })).toContain(
      'Email the contractor about it.',
    );
    expect(suggestedQuestionsFor('/housekeeping', null)).toContain(
      'Which rooms should we clean first?',
    );
    expect(suggestedQuestionsFor('/inbox/inq_1', null)).toContain('What is waiting for a reply?');
    expect(suggestedQuestionsFor('/', null)).toContain('How does today look?');
  });
});
