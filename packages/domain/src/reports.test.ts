import type { Booking, Charge, Payment, Quote } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { buildFolio } from './billing';
import { pricingConfig } from './pricing';
import {
  buildReport,
  createReportService,
  isSold,
  nightlyShare,
  previousPeriod,
  type ReportData,
} from './reports';
import { apartment, booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const pricing = {
  ...pricingConfig,
  cityTax: { label: 'City tax', perPersonPerNight: 50, minAge: 18 },
};

function priced(total: number, addons = 0): Quote {
  return {
    roomTypeId: double.id,
    checkIn: '2026-05-01',
    checkOut: '2026-05-04',
    nights: 3,
    adults: 2,
    childAges: [],
    lines: [
      { kind: 'accommodation', label: 'A', quantity: 1, unitPrice: total, amount: total },
      ...(addons
        ? [
            {
              kind: 'wellness' as const,
              label: 'W',
              quantity: 1,
              unitPrice: addons,
              amount: addons,
            },
          ]
        : []),
    ],
    total: total + addons,
    currency: 'CZK',
  };
}

const rooms = [
  room('rm_1', { name: '1' }),
  room('rm_2', { name: '2' }),
  room('rm_a', { name: 'A', roomTypeId: apartment.id, kind: 'apartment' }),
];

// The period is 1–5 May (four nights, twelve room nights).
const query = { from: '2026-05-01', to: '2026-05-05' };

const stays: Booking[] = [
  // 3 nights inside: 1000 CZK room, 300 wellness, by email.
  booking({
    id: 'in',
    roomId: 'rm_1',
    guestId: 'g1',
    checkIn: '2026-05-01',
    checkOut: '2026-05-04',
    status: 'checked_out',
    priceSnapshot: priced(1000, 300),
  }),
  // 4 nights, two before the period: half its 2000 falls inside. By phone, in the apartment.
  booking({
    id: 'across',
    roomId: 'rm_a',
    guestId: 'g2',
    checkIn: '2026-04-29',
    checkOut: '2026-05-03',
    childAges: [5],
    status: 'checked_out',
    source: 'phone',
    priceSnapshot: priced(2000),
  }),
  booking({
    id: 'held',
    roomId: 'rm_2',
    checkIn: '2026-05-01',
    checkOut: '2026-05-03',
    status: 'hold',
  }),
  booking({
    id: 'gone',
    roomId: 'rm_2',
    checkIn: '2026-05-03',
    checkOut: '2026-05-06',
    status: 'cancelled',
  }),
];

const charge: Charge = {
  id: 'chg_1',
  bookingId: 'in',
  label: 'Sauna',
  quantity: 1,
  unitPrice: 150,
  amount: 150,
  vatBracket: 'standard',
  postedOn: '2026-05-02',
  createdAt: '2026-05-02T10:00:00.000Z',
};

const payment = (overrides: Partial<Payment>): Payment => ({
  id: 'pay',
  bookingId: 'in',
  kind: 'payment',
  method: 'card',
  amount: 1000,
  note: null,
  paidOn: '2026-05-03',
  createdAt: '2026-05-03T10:00:00.000Z',
  ...overrides,
});

function data(overrides: Partial<ReportData> = {}): ReportData {
  return {
    rooms,
    roomTypes: [double, apartment],
    guests: [
      { id: 'g1', name: 'Test One', email: null, phone: null, language: 'en', notes: null },
      { id: 'g2', name: 'Test Two', email: null, phone: null, language: 'en', notes: null },
    ],
    bookings: stays,
    charges: [charge],
    payments: [payment({ id: 'p1' }), payment({ id: 'p2', kind: 'refund', amount: 200 })],
    departedFolios: [],
    pricing,
    ...overrides,
  };
}

describe('nightlyShare', () => {
  it('splits an amount into whole CZK that add up exactly', () => {
    const shares = [0, 1, 2].map((i) => nightlyShare(1000, 3, i));
    expect(shares).toEqual([333, 333, 334]);
    expect([0, 1, 2].map((i) => nightlyShare(-100, 3, i)).reduce((a, b) => a + b)).toBe(-100);
  });
});

describe('isSold', () => {
  it('counts confirmed, in-house and completed stays only', () => {
    expect(isSold(booking({ roomId: 'x', status: 'confirmed' }))).toBe(true);
    expect(isSold(booking({ roomId: 'x', status: 'checked_out' }))).toBe(true);
    expect(isSold(booking({ roomId: 'x', status: 'hold' }))).toBe(false);
    expect(isSold(booking({ roomId: 'x', status: 'cancelled' }))).toBe(false);
  });
});

describe('buildReport', () => {
  const report = buildReport(query, data());

  it('counts sold room nights inside the period only', () => {
    expect(report).toMatchObject({
      nights: 4,
      rooms: 3,
      roomNightsAvailable: 12,
      roomNightsSold: 5,
      occupancy: 5 / 12,
    });
  });

  it('spreads room revenue over the stay and keeps add-ons apart', () => {
    expect(report.roomRevenue).toBe(1000 + 1000);
    expect(report.addonRevenue).toBe(300);
    expect(report.adr).toBe(400);
    expect(report.revpar).toBe(Math.round(2000 / 12));
    expect(report.days.map((d) => d.roomsSold)).toEqual([2, 2, 1, 0]);
    expect(report.days.reduce((sum, d) => sum + d.roomRevenue, 0)).toBe(report.roomRevenue);
    expect(report.days[3]).toMatchObject({ date: '2026-05-04', occupancy: 0, roomRevenue: 0 });
  });

  it('counts guest nights, city tax for adults, extras and net payments', () => {
    expect(report.guestNights).toBe(2 * 3 + 3 * 2);
    expect(report.cityTax).toBe(5 * 2 * 50);
    expect(report.extrasRevenue).toBe(150);
    expect(report.payments).toEqual([
      { method: 'card', amount: 800 },
      { method: 'cash', amount: 0 },
      { method: 'bank_transfer', amount: 0 },
    ]);
  });

  it('counts arrivals, average stay and cancellations', () => {
    expect(report.arrivals).toBe(1);
    expect(report.averageStay).toBe(3);
    expect(report.cancellations).toBe(1);
  });

  it('slices by source and room type, each with its ADR', () => {
    expect(report.bySource).toEqual([
      { source: 'email', roomNights: 3, roomRevenue: 1000, adr: 333 },
      { source: 'phone', roomNights: 2, roomRevenue: 1000, adr: 500 },
    ]);
    expect(report.byRoomType).toEqual([
      expect.objectContaining({ roomTypeId: double.id, roomNights: 3, occupancy: 3 / 8, adr: 333 }),
      expect.objectContaining({
        roomTypeId: apartment.id,
        roomNights: 2,
        occupancy: 2 / 4,
        adr: 500,
      }),
    ]);
  });

  it('adds extras and add-ons to the revenue per available room night', () => {
    expect(report.trevpar).toBe(Math.round((2000 + 300 + 150) / 12));
  });

  it('counts the share of bookings cancelled', () => {
    // Two sold stays with nights in the period, one cancelled; the hold counts for neither.
    expect(report.cancellationRate).toBe(1 / 3);
  });

  it('runs each weekday of the period, Monday first', () => {
    // Fri 1 May to Mon 4 May: Fri and Sat 2 rooms each, Sun 1, Mon none.
    expect(report.byWeekday.map((w) => [w.weekday, w.nights, w.roomNights])).toEqual([
      [1, 1, 0],
      [5, 1, 2],
      [6, 1, 2],
      [7, 1, 1],
    ]);
    const friday = report.byWeekday.find((w) => w.weekday === 5)!;
    expect(friday).toMatchObject({ occupancy: 2 / 3, adr: 417, revpar: 278 });
    const twoWeeks = buildReport({ from: '2026-05-01', to: '2026-05-15' }, data());
    expect(twoWeeks.byWeekday.every((w) => w.nights === 2)).toBe(true);
    expect(twoWeeks.byWeekday.reduce((n, w) => n + w.roomNights, 0)).toBe(twoWeeks.roomNightsSold);
  });

  it('groups arrivals by length of stay and counts families and returning guests', () => {
    const extra = [
      booking({
        id: 'one',
        roomId: 'rm_2',
        guestId: 'g2',
        checkIn: '2026-05-03',
        checkOut: '2026-05-04',
        childAges: [7],
        status: 'confirmed',
      }),
      booking({
        id: 'long',
        roomId: 'rm_a',
        guestId: 'g3',
        checkIn: '2026-05-04',
        checkOut: '2026-05-12',
        status: 'confirmed',
      }),
    ];
    const r = buildReport(query, data({ bookings: [...stays, ...extra] }));
    expect(r.stayLengths).toEqual([
      { minNights: 1, maxNights: 1, arrivals: 1 },
      { minNights: 2, maxNights: 2, arrivals: 0 },
      { minNights: 3, maxNights: 4, arrivals: 1 },
      { minNights: 5, maxNights: 6, arrivals: 0 },
      { minNights: 7, maxNights: null, arrivals: 1 },
    ]);
    expect(r.arrivalsWithChildren).toBe(1);
    // g2 stayed from 29 April; g1 and g3 are new, unless their history says otherwise.
    expect(r.returningArrivals).toBe(1);
    const before = booking({
      id: 'old',
      roomId: 'rm_1',
      guestId: 'g3',
      checkIn: '2025-08-01',
      checkOut: '2025-08-03',
      status: 'checked_out',
    });
    const cancelled = booking({
      id: 'old2',
      roomId: 'rm_1',
      guestId: 'g1',
      checkIn: '2025-09-01',
      checkOut: '2025-09-03',
      status: 'cancelled',
    });
    const withHistory = buildReport(
      query,
      data({ bookings: [...stays, ...extra], history: [...stays, ...extra, before, cancelled] }),
    );
    expect(withHistory.returningArrivals).toBe(2);
  });

  it('lists departed guests who still owe, largest first', () => {
    const owing = buildFolio(stays[0]!, [charge], [], pricing);
    const settled = { ...buildFolio(stays[1]!, [], [], pricing), balance: 0 };
    const r = buildReport(query, data({ departedFolios: [settled, owing] }));
    expect(r.unpaidDepartures).toEqual([
      {
        bookingId: 'in',
        guestName: 'Test One',
        roomName: '1',
        checkOut: '2026-05-04',
        balance: owing.balance,
      },
    ]);
  });

  it('handles an empty hotel without dividing by zero', () => {
    const empty = buildReport(query, data({ rooms: [], bookings: [], charges: [], payments: [] }));
    expect(empty).toMatchObject({ occupancy: 0, adr: 0, revpar: 0, averageStay: 0 });
  });

  it('rejects reversed and over-long periods', () => {
    expect(() => buildReport({ from: '2026-05-05', to: '2026-05-01' }, data())).toThrow();
    expect(() => buildReport({ from: '2026-01-01', to: '2027-01-03' }, data())).toThrow(
      /at most 366 nights/,
    );
  });
});

describe('previousPeriod', () => {
  it('is the same length, right before', () => {
    expect(previousPeriod(query)).toEqual({ from: '2026-04-27', to: '2026-05-01' });
  });
});

describe('createReportService', () => {
  it('loads the period from the repositories and finds unpaid departures', async () => {
    const repos = createMemoryRepositories({
      rooms,
      roomTypes: [double, apartment],
      bookings: stays,
      charges: [charge],
      payments: [payment({ id: 'p1', bookingId: 'across', amount: 500 })],
    });
    const report = await createReportService({ repos, pricing }).getReport(query);
    expect(report.roomNightsSold).toBe(5);
    expect(report.extrasRevenue).toBe(150);
    expect(report.unpaidDepartures.map((u) => u.bookingId).sort()).toEqual(['across', 'in']);
  });
});
