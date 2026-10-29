import type { DailyBrief } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { followUps } from './agent-follow-ups';

const brief: DailyBrief = {
  date: '2026-10-27',
  occupancy: { occupied: 37, sellable: 49, total: 50 },
  guestsTonight: 81,
  arrivals: 9,
  departures: 7,
  turnovers: [],
  roomsToPrepare: [
    { roomId: 'rm_104', roomName: '104', status: 'dirty', guestName: 'Guest A', bookingId: 'bk_1' },
  ],
  holds: [],
  outOfOrder: [],
  maintenance: [],
  missingIds: [],
  unansweredMessages: 4,
  gaps: [],
};

const result = (name: string, output: unknown, input: unknown = {}) => ({
  id: `call_${name}`,
  name,
  input,
  output,
});

describe('followUps', () => {
  it('offers what the brief says needs doing, and the inbox as a page', () => {
    expect(followUps([result('getDailyBrief', brief)])).toEqual([
      {
        label: 'Which rooms still need to be ready for arrivals?',
        ask: 'Which rooms still need to be ready for arrivals?',
      },
      { label: 'Open the inbox (4)', path: '/inbox' },
    ]);
  });

  it('offers to record a balance that is still due', () => {
    const folio = {
      bookingId: 'bk_1',
      currency: 'USD',
      lines: [],
      payments: [],
      charged: 300,
      paid: 100,
      balance: 200,
      vat: [],
      taxMode: 'exclusive',
    };
    const [first] = followUps([result('getBill', folio)]);
    expect(first && 'ask' in first ? first.ask : null).toMatch(/^Record the .*200 balance/);
  });

  it('offers nothing for a tool result it cannot read, or a failed step', () => {
    expect(followUps([result('getDailyBrief', { error: { code: 'x', message: 'x' } })])).toEqual(
      [],
    );
    expect(followUps([result('getBill', { nope: true })])).toEqual([]);
  });

  it('keeps at most three, without repeats', () => {
    const many = followUps([
      result('getDailyBrief', { ...brief, missingIds: [], holds: [] }),
      result('getDailyBrief', brief),
      result('getHousekeeping', { date: '2026-10-27', rooms: [] }),
    ]);
    expect(many).toHaveLength(3);
    expect(new Set(many.map((f) => f.label)).size).toBe(3);
  });
});
