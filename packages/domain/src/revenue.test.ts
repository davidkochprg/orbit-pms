import type { LocalEvent, Payment, WeatherDay } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { pricingConfig } from './pricing';
import {
  buildOutlook,
  noShowChance,
  rateFactors,
  suggestedPercent,
  typicalOccupancy,
} from './revenue';
import { apartment, booking, double, room } from './test-fixtures';

// A Sunday.
const today = '2026-05-10';

function event(overrides: Partial<LocalEvent> = {}): LocalEvent {
  return {
    id: 'evt_1',
    name: 'Trail race',
    firstNight: today,
    lastNight: today,
    impact: 'medium',
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherDay> = {}): WeatherDay {
  return {
    date: today,
    kind: 'clear',
    tempMaxC: 12,
    tempMinC: 2,
    precipitationMm: 0,
    snowfallCm: 0,
    ...overrides,
  };
}

const signals = { date: '2026-05-16', today, events: [], weather: null };

describe('typicalOccupancy', () => {
  it('averages how full each weekday ended up over the last eight weeks', () => {
    const rooms = 2;
    // Room r1 is sold every Saturday night of the eight weeks; r2 only on the last one.
    const saturdays = Array.from({ length: 8 }, (_, i) => addDays('2026-05-09', -7 * i));
    const bookings = [
      ...saturdays.map((night) =>
        booking({
          roomId: 'r1',
          checkIn: night,
          checkOut: addDays(night, 1),
          status: 'checked_out',
        }),
      ),
      booking({
        roomId: 'r2',
        checkIn: '2026-05-09',
        checkOut: '2026-05-10',
        status: 'checked_out',
      }),
      booking({ roomId: 'r2', checkIn: '2026-05-08', checkOut: '2026-05-09', status: 'cancelled' }),
    ];
    const typical = typicalOccupancy(bookings, rooms, today);
    expect(typical[6]).toBeCloseTo((8 + 1) / 16);
    expect(typical[5]).toBe(0);
    expect(typicalOccupancy(bookings, 0, today)).toEqual(Array(7).fill(null));
  });
});

describe('rateFactors', () => {
  it('raises an almost full night, whatever is usual', () => {
    expect(rateFactors({ ...signals, occupancy: 0.92, typical: 0.95 })).toEqual([
      { kind: 'demand', label: 'Almost full', percent: 20 },
    ]);
  });

  it('raises a night busier than its weekday usually ends up', () => {
    expect(rateFactors({ ...signals, occupancy: 0.7, typical: 0.55 })).toEqual([
      { kind: 'demand', label: 'Busier than a usual Saturday', percent: 10 },
    ]);
    expect(rateFactors({ ...signals, occupancy: 0.69, typical: 0.55 })).toEqual([]);
  });

  it('lowers a quiet night only within a week of it', () => {
    const quiet = { ...signals, occupancy: 0.3, typical: 0.5 };
    expect(rateFactors(quiet)).toEqual([
      { kind: 'demand', label: 'Quiet for a Saturday', percent: -10 },
    ]);
    expect(rateFactors({ ...quiet, date: '2026-05-18' })).toEqual([]);
    expect(rateFactors({ ...quiet, typical: null })).toEqual([]);
  });

  it('adds the biggest event of the night and the weather', () => {
    expect(
      rateFactors({
        ...signals,
        occupancy: 0.5,
        typical: 0.5,
        events: [event(), event({ id: 'evt_2', name: 'Ski opening', impact: 'high' })],
        weather: weather({ kind: 'snow', snowfallCm: 12 }),
      }),
    ).toEqual([
      { kind: 'event', label: 'Ski opening', percent: 15 },
      { kind: 'weather', label: 'Fresh snow', percent: 5 },
    ]);
    expect(
      rateFactors({
        ...signals,
        occupancy: 0.5,
        typical: 0.5,
        weather: weather({ kind: 'storm' }),
      }),
    ).toEqual([{ kind: 'weather', label: 'Storm forecast', percent: -5 }]);
    expect(
      rateFactors({
        ...signals,
        occupancy: 0.5,
        typical: 0.5,
        weather: weather({ kind: 'rain', precipitationMm: 25 }),
      }),
    ).toEqual([{ kind: 'weather', label: 'Heavy rain', percent: -5 }]);
    // Wet snow that doesn't settle is neither fresh snow nor a storm.
    expect(
      rateFactors({
        ...signals,
        occupancy: 0.5,
        typical: 0.5,
        weather: weather({ kind: 'snow', precipitationMm: 25, snowfallCm: 3 }),
      }),
    ).toEqual([]);
  });
});

describe('suggestedPercent', () => {
  const factor = (percent: number) => ({ kind: 'event' as const, label: 'x', percent });

  it('adds the factors, rounded to 5 and kept within -20 and +30', () => {
    expect(suggestedPercent([factor(10), factor(5)], 0)).toBe(15);
    expect(suggestedPercent([factor(20), factor(15), factor(5)], 0)).toBe(30);
    expect(suggestedPercent([factor(-10), factor(-5), factor(-10)], 0)).toBe(-20);
    expect(suggestedPercent([factor(10), factor(-10)], 15)).toBe(0);
  });

  it("keeps the night's own change when nothing stands out", () => {
    expect(suggestedPercent([], 10)).toBe(10);
  });
});

describe('noShowChance', () => {
  const stay = booking({ id: 'bk_1', roomId: 'r1', checkIn: today, checkOut: '2026-05-12' });
  const deposit: Payment = {
    id: 'pay_1',
    bookingId: 'bk_1',
    kind: 'payment',
    method: 'card',
    amount: 100,
    note: null,
    paidOn: '2026-05-01',
    createdAt: '2026-05-01T10:00:00.000Z',
  };

  it('is low for a direct booking with a deposit', () => {
    expect(noShowChance({ booking: stay, guestBookings: [stay], payments: [deposit] })).toEqual({
      chance: 0.03,
      reasons: [],
    });
  });

  it('rises with an OTA booking, no deposit and an earlier cancellation', () => {
    const ota = { ...stay, source: 'ota' as const };
    const cancelled = booking({
      id: 'bk_0',
      roomId: 'r1',
      checkIn: '2026-03-01',
      status: 'cancelled',
    });
    expect(noShowChance({ booking: ota, guestBookings: [ota, cancelled], payments: [] })).toEqual({
      chance: 0.25,
      reasons: ['Booked through an OTA', 'No deposit', 'Cancelled a stay before'],
    });
  });

  it('falls for a returning guest, never below 1%', () => {
    const before = booking({
      id: 'bk_0',
      roomId: 'r1',
      checkIn: '2026-03-01',
      status: 'checked_out',
    });
    expect(
      noShowChance({ booking: stay, guestBookings: [stay, before], payments: [deposit] }),
    ).toEqual({ chance: 0.01, reasons: ['Has stayed before'] });
  });
});

describe('buildOutlook', () => {
  const rooms = [room('r1', { name: '101' }), room('r2', { name: '102' })];
  const bookings = [
    booking({ id: 'bk_a', roomId: 'r1', checkIn: today, checkOut: '2026-05-12', source: 'ota' }),
    booking({ id: 'bk_b', roomId: 'r2', checkIn: '2026-05-11', checkOut: '2026-05-12' }),
    booking({
      id: 'bk_c',
      guestId: 'gst_other',
      roomId: 'r2',
      checkIn: today,
      checkOut: '2026-05-11',
      status: 'cancelled',
    }),
  ];
  const outlook = buildOutlook({
    today,
    days: 3,
    rooms,
    roomTypes: [double, apartment],
    bookings,
    guests: [
      { id: 'gst_test', name: 'Test Guest', email: null, phone: null, language: 'en', notes: null },
    ],
    payments: [],
    pricing: { ...pricingConfig, adjustments: [{ date: '2026-05-12', percent: 10 }] },
    events: [event({ firstNight: '2026-05-11', lastNight: '2026-05-11', impact: 'high' })],
    weather: [weather()],
  });

  it('counts rooms sold, keeps the current change and suggests from the factors', () => {
    expect(
      outlook.nights.map((n) => [
        n.date,
        n.roomsSold,
        n.roomsTotal,
        n.currentPercent,
        n.suggestedPercent,
      ]),
    ).toEqual([
      // No nights sold in the weeks before, so half full is busier than usual.
      ['2026-05-10', 1, 2, 0, 10],
      ['2026-05-11', 2, 2, 0, 30],
      ['2026-05-12', 0, 2, 10, 10],
    ]);
    expect(outlook.nights[1]!.factors.map((f) => f.label)).toEqual(['Almost full', 'Trail race']);
    expect(outlook.nights[1]!.events).toEqual(['Trail race']);
    expect(outlook.nights[0]!.weather?.kind).toBe('clear');
    expect(outlook.nights[2]!.weather).toBeNull();
  });

  it('prices the room types it has rooms of, now and with the suggestion', () => {
    // Only doubles are in the house: the apartment type has no rooms.
    expect(outlook.nights.map((n) => n.rates)).toEqual([
      [{ roomType: 'Double', current: 1000, suggested: 1100 }],
      [{ roomType: 'Double', current: 1000, suggested: 1300 }],
      [{ roomType: 'Double', current: 1100, suggested: 1100 }],
    ]);
  });

  it('expects no-shows on arrival nights and lists the riskiest arrivals', () => {
    expect(outlook.nights.map((n) => n.expectedNoShows)).toEqual([0.15, 0.08, 0]);
    expect(outlook.arrivalRisks).toEqual([
      {
        bookingId: 'bk_a',
        guestName: 'Test Guest',
        roomName: '101',
        checkIn: today,
        source: 'ota',
        chance: 0.15,
        reasons: ['Booked through an OTA', 'No deposit'],
      },
    ]);
  });
});
