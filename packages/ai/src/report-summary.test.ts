import type { Report } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { reportFacts } from './prompts/report-summary';
import {
  createReportSummaryWriter,
  numbersIn,
  ReportSummaryError,
  unknownNumbers,
} from './report-summary';
import type { UsageRecord } from './usage';

/** A week from Monday Oct 5: busy at the weekend, quiet midweek. */
function report(overrides: Partial<Report> = {}): Report {
  const occupancy = [0.3, 0.2, 0.25, 0.4, 0.8, 0.9, 0.5];
  return {
    from: '2026-10-05',
    to: '2026-10-12',
    nights: 7,
    rooms: 10,
    roomNightsAvailable: 70,
    roomNightsSold: 34,
    occupancy: 34 / 70,
    guestNights: 60,
    roomRevenue: 6800,
    addonRevenue: 300,
    extrasRevenue: 250,
    cityTax: 0,
    adr: 200,
    revpar: 97,
    arrivals: 12,
    averageStay: 2.8,
    cancellations: 2,
    bySource: [
      { source: 'ota', roomNights: 20, roomRevenue: 4200 },
      { source: 'email', roomNights: 14, roomRevenue: 2600 },
    ],
    byRoomType: [
      {
        roomTypeId: 'rt_q',
        roomTypeName: 'Queen room',
        occupancy: 34 / 70,
        roomNights: 34,
        roomRevenue: 6800,
      },
    ],
    payments: [],
    unpaidDepartures: [
      { bookingId: 'bk_1', guestName: 'A', roomName: '101', checkOut: '2026-10-08', balance: 120 },
      { bookingId: 'bk_2', guestName: 'B', roomName: '102', checkOut: '2026-10-09', balance: 80 },
    ],
    days: occupancy.map((o, i) => ({
      date: `2026-10-${String(5 + i).padStart(2, '0')}`,
      roomsSold: Math.round(o * 10),
      occupancy: o,
      roomRevenue: 0,
    })),
    ...overrides,
  };
}

const previous = report({
  occupancy: 0.4,
  adr: 190,
  revpar: 76,
  roomRevenue: 5320,
  roomNightsSold: 28,
  bySource: [
    { source: 'ota', roomNights: 12, roomRevenue: 2280 },
    { source: 'email', roomNights: 16, roomRevenue: 3040 },
  ],
});

describe('reportFacts', () => {
  const facts = reportFacts(report(), previous, 'USD', '2026-10-31');

  it('works out the changes against the period before', () => {
    expect(facts).toContain(
      'Occupancy 49% (34 of 70 room nights), +9 pts vs the 7 nights before (40%)',
    );
    expect(facts).toContain('ADR $200, +5% vs before (was $190)');
    expect(facts).toContain('OTA 59% ($4,200, +16 pts); Email 41% ($2,600, -16 pts)');
  });

  it('gives the weekday pattern, the busiest and quietest nights and money owed', () => {
    expect(facts).toContain('By weekday, average occupancy: Sat 90%; Fri 80%; Sun 50%');
    expect(facts).toContain('Busiest night Sat, Oct 10 at 90%; quietest Tue, Oct 6 at 20%.');
    expect(facts).toContain('2 guests left owing $200 together.');
  });

  it('says when the nights are still ahead', () => {
    expect(reportFacts(report(), null, 'USD', '2026-10-01')).toContain('still ahead');
  });
});

describe('the number guard', () => {
  it('reads numbers without their thousands separators', () => {
    expect(numbersIn('$131,271 on 1,500 nights, 3.5 a stay, Oct 16')).toEqual([
      '131271',
      '1500',
      '3.5',
      '16',
    ]);
  });

  it('flags numbers the facts do not state', () => {
    const facts = reportFacts(report(), previous, 'USD', '2026-10-31');
    expect(unknownNumbers('Occupancy rose to 49%, +9 pts, at $200 a night.', facts)).toEqual([]);
    expect(unknownNumbers('Occupancy rose to 52% in 2026.', facts)).toEqual(['52', '2026']);
  });
});

describe('createReportSummaryWriter', () => {
  function writer(replies: string[]) {
    let calls = 0;
    const records: UsageRecord[] = [];
    const model = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: 'text', text: replies[calls++] ?? '' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 600, noCache: 600, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 80, text: 80, reasoning: undefined },
          },
          warnings: [],
        }),
    });
    const usage = {
      record: (r: UsageRecord) => {
        records.push(r);
        return Promise.resolve();
      },
      monthToDateMicroUsd: () => Promise.resolve(0),
    };
    return { records, summary: createReportSummaryWriter({ model, modelId: 'm', usage }) };
  }

  it('writes again once with the reason, then refuses', async () => {
    const good = 'Occupancy rose to 49%, +9 pts. Push the quiet Tuesdays.';
    const fixed = writer(['Occupancy rose to 52%.', good]);
    expect(await fixed.summary.write(report(), previous, 'USD', '2026-10-31')).toBe(good);
    expect(fixed.records.map((r) => r.feature)).toEqual(['report_summary', 'report_summary']);

    const wrong = writer(['Occupancy rose to 52%.', 'Still 52%.']);
    await expect(
      wrong.summary.write(report(), previous, 'USD', '2026-10-31'),
    ).rejects.toBeInstanceOf(ReportSummaryError);
  });
});
