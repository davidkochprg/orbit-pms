import type {
  Booking,
  BookingSource,
  IsoDate,
  Charge,
  Folio,
  Guest,
  Payment,
  PaymentMethod,
  PricingConfig,
  QuoteLine,
  Report,
  ReportQuery,
  Room,
  RoomType,
} from '@orbit/shared';
import { buildFolio, cityTaxPayers } from './billing';
import { addDays, assertValidRange, eachNight, nightsBetween } from './dates';
import { DomainError } from './errors';
import { currentPricing } from './rates';
import type { Repositories } from './repositories';

/** The longest period a report covers. */
export const MAX_REPORT_NIGHTS = 366;

const roomLineKinds: QuoteLine['kind'][] = [
  'accommodation',
  'child_discount',
  'long_stay_discount',
];
const sources: BookingSource[] = ['email', 'phone', 'web', 'ota', 'walk_in'];
/** Stay lengths as a report groups arrivals: one night, two, three to four, five to six, a week+. */
const stayLengthBuckets: [number, number | null][] = [
  [1, 1],
  [2, 2],
  [3, 4],
  [5, 6],
  [7, null],
];
const methods: PaymentMethod[] = ['card', 'cash', 'bank_transfer'];

/** Stays that count as sold: confirmed, in house or completed. Holds and cancellations don't. */
export function isSold(booking: Booking): boolean {
  return (
    booking.status === 'confirmed' ||
    booking.status === 'checked_in' ||
    booking.status === 'checked_out'
  );
}

/**
 * Splits `total` over `nights` so the shares are whole units and add up exactly: night `i` gets
 * `floor((i + 1) * total / nights) - floor(i * total / nights)`.
 */
export function nightlyShare(total: number, nights: number, index: number): number {
  return Math.floor(((index + 1) * total) / nights) - Math.floor((index * total) / nights);
}

function sumLines(booking: Booking, kinds: QuoteLine['kind'][]): number {
  return (booking.priceSnapshot?.lines ?? [])
    .filter((l) => kinds.includes(l.kind))
    .reduce((sum, l) => sum + l.amount, 0);
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/** ISO weekday of a date: 1 is Monday, 7 is Sunday. */
export function isoWeekday(date: IsoDate): number {
  return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** A slice with the ADR its room nights and room revenue give. */
function withAdr<T extends { roomNights: number; roomRevenue: number }>(slice: T) {
  return { ...slice, adr: Math.round(ratio(slice.roomRevenue, slice.roomNights)) };
}

export interface ReportData {
  rooms: Room[];
  roomTypes: RoomType[];
  guests: Guest[];
  /** Bookings with at least one night in the period. */
  bookings: Booking[];
  /** Charges posted in the period. */
  charges: Charge[];
  /** Payments and refunds made in the period. */
  payments: Payment[];
  /** Bills of guests who checked out in the period. */
  departedFolios: Folio[];
  pricing: PricingConfig;
  /** Every booking, to tell returning guests; `bookings` when absent. */
  history?: Booking[];
}

/** Performance over `[from, to)`. See `reportSchema` for what each figure means. */
export function buildReport({ from, to }: ReportQuery, data: ReportData): Report {
  assertValidRange({ checkIn: from, checkOut: to });
  const periodNights = eachNight({ checkIn: from, checkOut: to });
  if (periodNights.length > MAX_REPORT_NIGHTS) {
    throw new DomainError('invalid_input', `A report covers at most ${MAX_REPORT_NIGHTS} nights`);
  }
  const dayIndex = new Map(periodNights.map((d, i) => [d, i]));
  const roomById = new Map(data.rooms.map((r) => [r.id, r]));
  const days = periodNights.map((date) => ({ date, roomsSold: 0, roomRevenue: 0 }));
  const bySource = new Map(sources.map((s) => [s, { roomNights: 0, roomRevenue: 0 }]));
  const byType = new Map(data.roomTypes.map((t) => [t.id, { roomNights: 0, roomRevenue: 0 }]));
  let addonRevenue = 0;
  let cityTax = 0;
  let guestNights = 0;
  let cancellations = 0;
  let soldBookings = 0;
  let returningArrivals = 0;
  let arrivalsWithChildren = 0;
  const arrivalLengths: number[] = [];
  const history = (data.history ?? data.bookings).filter(isSold);

  for (const b of data.bookings) {
    const inPeriod = b.checkIn < to && b.checkOut > from;
    if (b.status === 'cancelled' && inPeriod) cancellations++;
    if (!isSold(b)) continue;
    if (inPeriod) soldBookings++;
    if (b.checkIn >= from && b.checkIn < to) {
      arrivalLengths.push(nightsBetween(b.checkIn, b.checkOut));
      if (b.childAges.length > 0) arrivalsWithChildren++;
      const stayedBefore = history.some(
        (h) => h.guestId === b.guestId && h.id !== b.id && h.checkIn < b.checkIn,
      );
      if (stayedBefore) returningArrivals++;
    }
    const stayNights = eachNight(b);
    const room = sumLines(b, roomLineKinds);
    const addons = (b.priceSnapshot?.total ?? 0) - room;
    const typeId = roomById.get(b.roomId)?.roomTypeId;
    const taxPayers = cityTaxPayers(b, data.pricing.cityTax.minAge);
    stayNights.forEach((night, i) => {
      const d = dayIndex.get(night);
      if (d === undefined) return;
      const revenue = nightlyShare(room, stayNights.length, i);
      days[d]!.roomsSold += 1;
      days[d]!.roomRevenue += revenue;
      addonRevenue += nightlyShare(addons, stayNights.length, i);
      cityTax += taxPayers * data.pricing.cityTax.perPersonPerNight;
      guestNights += b.adults + b.childAges.length;
      for (const slice of [bySource.get(b.source), typeId && byType.get(typeId)]) {
        if (!slice) continue;
        slice.roomNights += 1;
        slice.roomRevenue += revenue;
      }
    });
  }

  const roomNightsSold = days.reduce((sum, d) => sum + d.roomsSold, 0);
  const roomRevenue = days.reduce((sum, d) => sum + d.roomRevenue, 0);
  const roomNightsAvailable = data.rooms.length * periodNights.length;
  const guestName = new Map(data.guests.map((g) => [g.id, g.name]));
  const bookingById = new Map(data.bookings.map((b) => [b.id, b]));
  const extrasRevenue = data.charges.reduce((sum, c) => sum + c.amount, 0);
  const weekdays = new Map<number, { nights: number; roomNights: number; roomRevenue: number }>();
  for (const d of days) {
    const weekday = isoWeekday(d.date);
    const w = weekdays.get(weekday) ?? { nights: 0, roomNights: 0, roomRevenue: 0 };
    w.nights += 1;
    w.roomNights += d.roomsSold;
    w.roomRevenue += d.roomRevenue;
    weekdays.set(weekday, w);
  }

  return {
    from,
    to,
    nights: periodNights.length,
    rooms: data.rooms.length,
    roomNightsAvailable,
    roomNightsSold,
    occupancy: ratio(roomNightsSold, roomNightsAvailable),
    guestNights,
    roomRevenue,
    addonRevenue,
    extrasRevenue,
    cityTax,
    adr: Math.round(ratio(roomRevenue, roomNightsSold)),
    revpar: Math.round(ratio(roomRevenue, roomNightsAvailable)),
    trevpar: Math.round(ratio(roomRevenue + addonRevenue + extrasRevenue, roomNightsAvailable)),
    arrivals: arrivalLengths.length,
    averageStay:
      Math.round(
        ratio(
          arrivalLengths.reduce((a, b) => a + b, 0),
          arrivalLengths.length,
        ) * 10,
      ) / 10,
    cancellations,
    cancellationRate: ratio(cancellations, cancellations + soldBookings),
    returningArrivals,
    arrivalsWithChildren,
    stayLengths: stayLengthBuckets.map(([minNights, maxNights]) => ({
      minNights,
      maxNights,
      arrivals: arrivalLengths.filter(
        (n) => n >= minNights && (maxNights === null || n <= maxNights),
      ).length,
    })),
    byWeekday: [...weekdays.entries()]
      .sort(([a], [b]) => a - b)
      .map(([weekday, w]) => ({
        weekday,
        nights: w.nights,
        roomNights: w.roomNights,
        occupancy: ratio(w.roomNights, w.nights * data.rooms.length),
        adr: Math.round(ratio(w.roomRevenue, w.roomNights)),
        revpar: Math.round(ratio(w.roomRevenue, w.nights * data.rooms.length)),
      })),
    bySource: sources
      .map((source) => withAdr({ source, ...bySource.get(source)! }))
      .filter((s) => s.roomNights > 0),
    byRoomType: data.roomTypes.map((t) => {
      const slice = byType.get(t.id)!;
      const rooms = data.rooms.filter((r) => r.roomTypeId === t.id).length;
      return {
        roomTypeId: t.id,
        roomTypeName: t.name,
        ...withAdr(slice),
        occupancy: ratio(slice.roomNights, rooms * periodNights.length),
      };
    }),
    payments: methods.map((method) => ({
      method,
      amount: data.payments
        .filter((p) => p.method === method)
        .reduce((sum, p) => sum + (p.kind === 'refund' ? -p.amount : p.amount), 0),
    })),
    unpaidDepartures: data.departedFolios
      .filter((f) => f.balance > 0)
      .map((f) => {
        const b = bookingById.get(f.bookingId);
        return {
          bookingId: f.bookingId,
          guestName: (b && guestName.get(b.guestId)) ?? 'Unknown guest',
          roomName: (b && roomById.get(b.roomId)?.name) ?? '?',
          checkOut: b?.checkOut ?? to,
          balance: f.balance,
        };
      })
      .sort((a, b) => b.balance - a.balance),
    days: days.map((d) => ({ ...d, occupancy: ratio(d.roomsSold, data.rooms.length) })),
  };
}

export interface ReportDeps {
  repos: Repositories;
  /** Used until a manager saves rates. */
  pricing: PricingConfig;
}

export function createReportService({ repos, pricing }: ReportDeps) {
  return {
    async getReport(query: ReportQuery): Promise<Report> {
      const { from, to } = query;
      assertValidRange({ checkIn: from, checkOut: to });
      const bookings = await repos.bookings.listBookings({ from, to });
      // A guest who leaves on `to` slept their last night inside the period.
      const departed = bookings.filter(
        (b) => b.status === 'checked_out' && b.checkOut > from && b.checkOut <= to,
      );
      const rates = await currentPricing(repos, pricing);
      const departedFolios = await Promise.all(
        departed.map(async (b) =>
          buildFolio(
            b,
            await repos.billing.listCharges({ bookingId: b.id }),
            await repos.billing.listPayments({ bookingId: b.id }),
            rates,
          ),
        ),
      );
      return buildReport(query, {
        rooms: await repos.rooms.listRooms(),
        roomTypes: await repos.rooms.listRoomTypes(),
        guests: await repos.guests.listGuests(),
        bookings,
        charges: await repos.billing.listCharges({ from, to }),
        payments: await repos.billing.listPayments({ from, to }),
        departedFolios,
        pricing: rates,
        history: await repos.bookings.listBookings(),
      });
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;

/** The period just before `query`, of the same length, for comparisons. */
export function previousPeriod({ from, to }: ReportQuery): ReportQuery {
  return { from: addDays(from, -nightsBetween(from, to)), to: from };
}
