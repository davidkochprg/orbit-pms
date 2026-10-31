import type { Inquiry, LocalEvent, Payment, RateSignal, WeatherDay } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { pricingConfig } from './pricing';
import {
  buildOutlook,
  insightFactors,
  noShowChance,
  openInquiries,
  type RateReviewInput,
  rateFactors,
  reviewBasis,
  reviewSignals,
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

  it('raises a night by how far it is ahead of its weekday usual, up to +15', () => {
    const busier = (percent: number) => [
      { kind: 'demand', label: 'Busier than a usual Saturday', percent },
    ];
    expect(rateFactors({ ...signals, occupancy: 0.65, typical: 0.55 })).toEqual(busier(5));
    expect(rateFactors({ ...signals, occupancy: 0.75, typical: 0.55 })).toEqual(busier(10));
    expect(rateFactors({ ...signals, occupancy: 0.85, typical: 0.2 })).toEqual(busier(15));
    expect(rateFactors({ ...signals, occupancy: 0.64, typical: 0.55 })).toEqual([]);
  });

  it('lowers a quiet night by how far it is behind, only within ten days of it', () => {
    const quiet = (percent: number) => [{ kind: 'demand', label: 'Quiet for a Saturday', percent }];
    expect(rateFactors({ ...signals, occupancy: 0.35, typical: 0.5 })).toEqual(quiet(-5));
    expect(rateFactors({ ...signals, occupancy: 0.2, typical: 0.5 })).toEqual(quiet(-10));
    expect(rateFactors({ ...signals, occupancy: 0, typical: 0.8 })).toEqual(quiet(-15));
    expect(rateFactors({ ...signals, occupancy: 0.36, typical: 0.5 })).toEqual([]);
    const behind = { ...signals, occupancy: 0.2, typical: 0.5 };
    expect(rateFactors({ ...behind, date: '2026-05-20' })).toHaveLength(1);
    expect(rateFactors({ ...behind, date: '2026-05-21' })).toEqual([]);
    expect(rateFactors({ ...behind, typical: null })).toEqual([]);
  });

  it('lifts the nights either side of a medium or big event', () => {
    const usual = { ...signals, occupancy: 0.5, typical: 0.5 };
    const race = event({ firstNight: '2026-05-17', lastNight: '2026-05-17' });
    expect(rateFactors({ ...usual, nearby: [race] })).toEqual([
      { kind: 'event', label: 'Night before Trail race', percent: 5 },
    ]);
    const opening = event({
      name: 'Ski opening',
      firstNight: '2026-05-14',
      lastNight: '2026-05-15',
    });
    expect(rateFactors({ ...usual, nearby: [race, { ...opening, impact: 'high' }] })).toEqual([
      { kind: 'event', label: 'Night after Ski opening', percent: 10 },
    ]);
    expect(rateFactors({ ...usual, nearby: [{ ...race, impact: 'low' }] })).toEqual([]);
    // An event on the night itself counts instead.
    expect(rateFactors({ ...usual, events: [event()], nearby: [race] })).toEqual([
      { kind: 'event', label: 'Trail race', percent: 10 },
    ]);
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
    expect(
      rateFactors({
        ...signals,
        occupancy: 0.5,
        typical: 0.5,
        weather: weather({ kind: 'snow', snowfallCm: 15 }),
      }),
    ).toEqual([{ kind: 'weather', label: 'Heavy snow', percent: 10 }]);
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

function signal(overrides: Partial<RateSignal> = {}): RateSignal {
  return {
    firstNight: '2026-05-15',
    lastNight: '2026-05-16',
    direction: 'up',
    strength: 'moderate',
    label: 'Group asking for six rooms',
    reason: 'A wedding planner asked for a block of rooms on Friday and Saturday.',
    ...overrides,
  };
}

describe('insightFactors', () => {
  it('turns the signals that cover a night into percents by their strength', () => {
    const signals = [
      signal(),
      signal({
        firstNight: '2026-05-16',
        direction: 'down',
        strength: 'slight',
        label: 'Road works',
      }),
      signal({ firstNight: '2026-05-20', lastNight: '2026-05-20', strength: 'strong' }),
    ];
    expect(insightFactors('2026-05-16', signals)).toEqual([
      {
        kind: 'insight',
        label: 'Group asking for six rooms',
        detail: 'A wedding planner asked for a block of rooms on Friday and Saturday.',
        percent: 10,
      },
      { kind: 'insight', label: 'Road works', detail: signals[1]!.reason, percent: -5 },
    ]);
    expect(insightFactors('2026-05-20', signals).map((f) => f.percent)).toEqual([15]);
    expect(insightFactors('2026-05-17', signals)).toEqual([]);
  });
});

describe('reviewSignals', () => {
  it('cuts signals to the reviewed nights and drops those outside or reversed', () => {
    expect(
      reviewSignals(
        [
          signal({ firstNight: '2026-05-08', lastNight: '2026-05-11' }),
          signal({ firstNight: '2026-05-12', lastNight: '2026-05-30' }),
          signal({ firstNight: '2026-05-01', lastNight: '2026-05-09' }),
          signal({ firstNight: '2026-05-20', lastNight: '2026-05-19' }),
        ],
        today,
        14,
      ).map((s) => [s.firstNight, s.lastNight]),
    ).toEqual([
      [today, '2026-05-11'],
      ['2026-05-12', '2026-05-23'],
    ]);
  });
});

function inquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  const id = overrides.id ?? 'inq_1';
  return {
    id,
    channel: 'email',
    partner: null,
    subject: 'Rooms for a group',
    senderName: 'Test Planner',
    senderAddress: 'planner@example.com',
    receivedAt: '2026-05-09T10:00:00.000Z',
    lastMessageAt: '2026-05-09T10:00:00.000Z',
    messages: [
      {
        id: `msg_${id}`,
        inquiryId: id,
        direction: 'in',
        body: 'Six rooms for Friday and Saturday?',
        sentAt: '2026-05-09T10:00:00.000Z',
        author: null,
        translation: null,
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
      },
    ],
    unread: true,
    archivedAt: null,
    starred: false,
    trashedAt: null,
    labelIds: [],
    parsed: null,
    suggestion: null,
    status: 'new',
    bookingId: null,
    processedAt: null,
    processingError: null,
    ...overrides,
  };
}

describe('openInquiries', () => {
  it("reads open requests' latest guest message, newest first", () => {
    const reply = {
      ...inquiry().messages[0]!,
      id: 'msg_out',
      direction: 'out' as const,
      body: 'We will check.',
    };
    const open = openInquiries([
      inquiry({ id: 'inq_old', lastMessageAt: '2026-05-01T10:00:00.000Z' }),
      inquiry({ messages: [...inquiry().messages, reply], status: 'replied' }),
      inquiry({ id: 'inq_booked', bookingId: 'bk_1' }),
      inquiry({ id: 'inq_archived', archivedAt: '2026-05-09T12:00:00.000Z' }),
      inquiry({ id: 'inq_declined', status: 'declined' }),
      inquiry({
        id: 'inq_question',
        parsed: {
          kind: 'question',
          language: 'en',
          guestName: null,
          checkIn: null,
          checkOut: null,
          adults: null,
          childAges: [],
          wishes: { wellness: false, dog: false, apartment: false },
          question: 'Is there parking?',
        },
      }),
    ]);
    expect(open.map((i) => i.id)).toEqual(['inq_1', 'inq_old']);
    expect(open[0]).toEqual({
      id: 'inq_1',
      receivedAt: '2026-05-09T10:00:00.000Z',
      subject: 'Rooms for a group',
      message: 'Six rooms for Friday and Saturday?',
      checkIn: null,
      checkOut: null,
      adults: null,
    });
  });
});

describe('reviewBasis', () => {
  const input: RateReviewInput = {
    today,
    hotel: { name: 'Test Lodge', location: 'Test Valley', country: 'US' },
    nights: [],
    events: [event()],
    inquiries: openInquiries([inquiry()]),
  };

  it('changes with what the review reads, not with the same input again', () => {
    expect(reviewBasis(input)).toMatch(/^[0-9a-f]{8}$/);
    expect(reviewBasis({ ...input })).toBe(reviewBasis(input));
    expect(reviewBasis({ ...input, today: '2026-05-11' })).not.toBe(reviewBasis(input));
    expect(reviewBasis({ ...input, inquiries: [] })).not.toBe(reviewBasis(input));
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
      // No nights sold in the weeks before, so half full is far busier than usual; it is also the
      // night before the race.
      ['2026-05-10', 1, 2, 0, 25],
      ['2026-05-11', 2, 2, 0, 30],
      ['2026-05-12', 0, 2, 10, 10],
    ]);
    expect(outlook.nights[0]!.factors.map((f) => f.label)).toEqual([
      'Busier than a usual Sunday',
      'Night before Trail race',
    ]);
    expect(outlook.nights[1]!.factors.map((f) => f.label)).toEqual(['Almost full', 'Trail race']);
    expect(outlook.nights[2]!.factors.map((f) => f.label)).toEqual(['Night after Trail race']);
    expect(outlook.nights[1]!.events).toEqual(['Trail race']);
    expect(outlook.nights[0]!.weather?.kind).toBe('clear');
    expect(outlook.nights[2]!.weather).toBeNull();
  });

  it('prices the room types it has rooms of, now and with the suggestion', () => {
    // Only doubles are in the house: the apartment type has no rooms.
    expect(outlook.nights.map((n) => n.rates)).toEqual([
      [{ roomType: 'Double', current: 1000, suggested: 1250 }],
      [{ roomType: 'Double', current: 1000, suggested: 1300 }],
      [{ roomType: 'Double', current: 1100, suggested: 1100 }],
    ]);
  });

  it("adds the review's signals to the nights they cover", () => {
    const reviewed = buildOutlook({
      today,
      days: 3,
      rooms,
      roomTypes: [double],
      bookings: [],
      guests: [],
      payments: [],
      pricing: pricingConfig,
      events: [],
      weather: [],
      signals: [signal({ firstNight: '2026-05-11', lastNight: '2026-05-11', strength: 'strong' })],
    });
    expect(reviewed.nights.map((n) => n.suggestedPercent)).toEqual([0, 15, 0]);
    expect(reviewed.nights[1]!.factors).toEqual([expect.objectContaining({ kind: 'insight' })]);
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
