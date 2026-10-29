import { createHousekeepingService } from '@orbit/domain';
import { createMemoryRepositories } from '@orbit/domain/testing';
import type { Booking, StayReadings } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createStayNotesReader, STAYS_PER_CALL } from './stay-notes';
import type { UsageRecord } from './usage';

const now = new Date('2026-05-10T08:00:00Z');
const usageTokens = {
  inputTokens: { total: 300, noCache: 300, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
};

function arrival(n: number, notes: string | null): Booking {
  return {
    id: `bk_${n}`,
    guestId: 'gst_test',
    roomId: `rm_${n}`,
    checkIn: '2026-05-10',
    checkOut: '2026-05-12',
    adults: 2,
    childAges: [],
    status: 'confirmed',
    holdExpiresAt: null,
    source: 'email',
    addons: { wellness: false, dogs: 0, extraBeds: 0 },
    priceSnapshot: null,
    notes,
  };
}

function setup(bookings: Booking[], reading: StayReadings) {
  const repos = createMemoryRepositories(
    {
      rooms: bookings.map((b) => ({
        id: b.roomId,
        name: b.roomId.slice(3),
        roomTypeId: 'rt',
        kind: 'room' as const,
        floor: 1,
        status: 'dirty' as const,
      })),
      bookings,
    },
    () => now,
  );
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(reading) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: usageTokens,
        warnings: [],
      });
    },
  });
  const records: UsageRecord[] = [];
  const reader = createStayNotesReader({
    model,
    modelId: 'muse-spark-1.3',
    housekeeping: createHousekeepingService({ repos, clock: () => now, newId: (p) => `${p}_1` }),
    usage: {
      record: (r) => {
        records.push(r);
        return Promise.resolve();
      },
      monthToDateMicroUsd: () => Promise.resolve(0),
    },
  });
  return { repos, reader, prompts, records };
}

describe('createStayNotesReader', () => {
  it('reads the unread stays once, keeps the readings and records the cost', async () => {
    const { repos, reader, prompts, records } = setup(
      [arrival(1, 'Our baby needs a cot.'), arrival(2, null)],
      {
        stays: [
          { bookingId: 'bk_1', pets: false, mess: 'usual', messReason: null, prepare: ['cot'] },
        ],
      },
    );
    expect(await reader.read()).toBe(0);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Stay bk_1');
    expect(prompts[0]).toContain('Our baby needs a cot.');
    expect(prompts[0]).not.toContain('bk_2');
    expect(repos.state.stayReadings).toMatchObject([{ bookingId: 'bk_1', prepare: ['Cot'] }]);
    expect(records).toMatchObject([{ feature: 'stay_notes', model: 'muse-spark-1.3' }]);

    // Nothing changed, so nothing is sent again.
    expect(await reader.read()).toBe(0);
    expect(prompts).toHaveLength(1);
  });

  it(`reads at most ${STAYS_PER_CALL} stays per call and says how many are left`, async () => {
    const bookings = Array.from({ length: STAYS_PER_CALL + 2 }, (_, i) =>
      arrival(i + 1, `Note ${i + 1}`),
    );
    const { reader, repos } = setup(bookings, { stays: [] });
    expect(await reader.read()).toBe(2);
    expect(repos.state.stayReadings).toHaveLength(STAYS_PER_CALL);
    expect(await reader.read()).toBe(0);
  });
});
