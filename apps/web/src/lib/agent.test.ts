import { describe, expect, it } from 'vitest';
import {
  agentErrorMessage,
  asProposal,
  asToolError,
  orbStateFor,
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

  it('shows API error messages such as the demo limit', () => {
    const body = JSON.stringify({
      error: { code: 'demo_limit', message: 'Demo limit reached for today.' },
    });
    expect(agentErrorMessage(new Error(body))).toBe('Demo limit reached for today.');
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
