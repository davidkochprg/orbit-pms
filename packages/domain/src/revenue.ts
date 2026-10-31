import type {
  ArrivalRisk,
  Booking,
  EventImpact,
  Guest,
  HotelProfile,
  Inquiry,
  IsoDate,
  LocalEvent,
  NightOutlook,
  Payment,
  PricingConfig,
  RateFactor,
  RateSignal,
  RateSignalStrength,
  Room,
  RoomType,
  WeatherDay,
} from '@orbit/shared';
import { addDays } from './dates';
import { adjustmentFor, nightlyRate } from './pricing/quote';

/**
 * How suggested rates are built. Illustrative rules for the demo, not tuned on a real hotel: a
 * factor applies when its condition holds, the factors add up, and the sum is rounded to `step`
 * and kept within `min` and `max`.
 */
export const rateRules = {
  /** Occupancy on the books from which a night counts as almost full. */
  almostFull: { occupancy: 0.9, percent: 20 },
  /** Ahead of how full this weekday usually ends up: each `margin` ahead adds `percent`. */
  ahead: { margin: 0.1, percent: 5, max: 15 },
  /** Behind the usual with at most `withinDays` left to sell: each `margin` behind takes `percent`. */
  quiet: { margin: 0.15, withinDays: 10, percent: -5, min: -15 },
  event: { low: 5, medium: 10, high: 15 } satisfies Record<EventImpact, number>,
  /** The night before and the night after an event, for guests who come early or stay on. */
  shoulder: { low: 0, medium: 5, high: 10 } satisfies Record<EventImpact, number>,
  /** Fresh snow brings skiers to a mountain hotel; `heavyCm` or more brings more. */
  snow: { cm: 5, percent: 5, heavyCm: 15, heavyPercent: 10 },
  /** Storms, and rain of `mm` or more, keep short-notice guests away. */
  storm: { mm: 20, percent: -5 },
  /** What a signal from the model's review adds, by its strength; a signal down takes it away. */
  insight: { slight: 5, moderate: 10, strong: 15 } satisfies Record<RateSignalStrength, number>,
  min: -20,
  max: 30,
  step: 5,
} as const;

/** Nights the model's review covers, from today. */
export const REVIEW_DAYS = 60;
/** Open conversations the review reads, newest first, and how much of each message. */
const REVIEW_INQUIRIES = 20;
const REVIEW_MESSAGE_CHARS = 800;

/** Weeks of past nights that set how full a weekday usually ends up. */
export const TYPICAL_WEEKS = 8;
/** Nights ahead the arrival-risk list covers. */
export const RISK_DAYS = 7;

/** Shares are fractions; a share exactly on a margin counts as reaching it. */
const EPSILON = 1e-9;

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekday(date: IsoDate): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Whether a booking holds a room on `night`: anything not cancelled whose stay covers it. */
function occupies(booking: Booking, night: IsoDate): boolean {
  return booking.status !== 'cancelled' && booking.checkIn <= night && night < booking.checkOut;
}

function roomsSold(bookings: Booking[], night: IsoDate): number {
  return new Set(bookings.filter((b) => occupies(b, night)).map((b) => b.roomId)).size;
}

/**
 * How full each weekday ended up over the `TYPICAL_WEEKS` before `today`, 0 to 1, indexed by
 * weekday (0 = Sunday). Null for a weekday with no past nights.
 */
export function typicalOccupancy(
  bookings: Booking[],
  roomCount: number,
  today: IsoDate,
): (number | null)[] {
  const sums = Array<number>(7).fill(0);
  const counts = Array<number>(7).fill(0);
  if (roomCount === 0) return Array<null>(7).fill(null);
  for (let back = 1; back <= TYPICAL_WEEKS * 7; back++) {
    const night = addDays(today, -back);
    sums[weekday(night)]! += roomsSold(bookings, night) / roomCount;
    counts[weekday(night)]! += 1;
  }
  return sums.map((sum, day) => (counts[day] ? sum / counts[day] : null));
}

export interface NightSignals {
  date: IsoDate;
  today: IsoDate;
  occupancy: number;
  typical: number | null;
  events: LocalEvent[];
  /** Events that end the night before or start the night after; only used without `events`. */
  nearby?: LocalEvent[];
  weather: WeatherDay | null;
}

/** How many whole `margin`s `gap` is, at most `limit`. */
function steps(gap: number, margin: number, limit: number): number {
  return Math.min(Math.floor((gap + EPSILON) / margin), limit);
}

/** The reasons to change a night's rate, each with what it adds. Empty when nothing stands out. */
export function rateFactors({
  date,
  today,
  occupancy,
  typical,
  events,
  nearby = [],
  weather,
}: NightSignals): RateFactor[] {
  const factors: RateFactor[] = [];
  const day = weekdays[weekday(date)]!;
  const daysLeft = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  if (occupancy >= rateRules.almostFull.occupancy) {
    factors.push({ kind: 'demand', label: 'Almost full', percent: rateRules.almostFull.percent });
  } else if (typical !== null && occupancy - typical >= rateRules.ahead.margin - EPSILON) {
    const { margin, percent, max } = rateRules.ahead;
    factors.push({
      kind: 'demand',
      label: `Busier than a usual ${day}`,
      percent: steps(occupancy - typical, margin, max / percent) * percent,
    });
  } else if (
    typical !== null &&
    daysLeft <= rateRules.quiet.withinDays &&
    typical - occupancy >= rateRules.quiet.margin - EPSILON
  ) {
    const { margin, percent, min } = rateRules.quiet;
    factors.push({
      kind: 'demand',
      label: `Quiet for a ${day}`,
      percent: steps(typical - occupancy, margin, min / percent) * percent,
    });
  }
  const biggest = [...events].sort(
    (a, b) => rateRules.event[b.impact] - rateRules.event[a.impact],
  )[0];
  if (biggest) {
    factors.push({ kind: 'event', label: biggest.name, percent: rateRules.event[biggest.impact] });
  } else {
    const near = [...nearby].sort(
      (a, b) => rateRules.shoulder[b.impact] - rateRules.shoulder[a.impact],
    )[0];
    if (near && rateRules.shoulder[near.impact] > 0) {
      factors.push({
        kind: 'event',
        label: `${near.firstNight > date ? 'Night before' : 'Night after'} ${near.name}`,
        percent: rateRules.shoulder[near.impact],
      });
    }
  }
  if (weather && weather.snowfallCm >= rateRules.snow.heavyCm) {
    factors.push({ kind: 'weather', label: 'Heavy snow', percent: rateRules.snow.heavyPercent });
  } else if (weather && weather.snowfallCm >= rateRules.snow.cm) {
    factors.push({ kind: 'weather', label: 'Fresh snow', percent: rateRules.snow.percent });
  } else if (weather?.kind === 'storm') {
    factors.push({ kind: 'weather', label: 'Storm forecast', percent: rateRules.storm.percent });
  } else if (weather?.kind === 'rain' && weather.precipitationMm >= rateRules.storm.mm) {
    factors.push({ kind: 'weather', label: 'Heavy rain', percent: rateRules.storm.percent });
  }
  return factors;
}

/** The signals from the model's review that cover `date`, as factors. */
export function insightFactors(date: IsoDate, signals: RateSignal[]): RateFactor[] {
  return signals
    .filter((s) => s.firstNight <= date && date <= s.lastNight)
    .map((s) => ({
      kind: 'insight',
      label: s.label,
      detail: s.reason,
      percent: (s.direction === 'up' ? 1 : -1) * rateRules.insight[s.strength],
    }));
}

/**
 * The percent the factors suggest, rounded to `rateRules.step` and kept within its limits. With no
 * factors the night keeps what it has, so a manager's own change is never suggested away.
 */
export function suggestedPercent(factors: RateFactor[], current: number): number {
  if (factors.length === 0) return current;
  const sum = factors.reduce((total, f) => total + f.percent, 0);
  const rounded = Math.round(sum / rateRules.step) * rateRules.step;
  return Math.min(rateRules.max, Math.max(rateRules.min, rounded)) || 0;
}

export interface RiskInput {
  booking: Booking;
  /** All of the guest's bookings, this one included. */
  guestBookings: Booking[];
  /** Payments on this booking. */
  payments: Payment[];
}

/**
 * The chance a confirmed arrival leaves its room empty on the first night, from how it was booked
 * and the guest's own history, never from who the guest is. Illustrative weights for the demo.
 */
export function noShowChance({ booking, guestBookings, payments }: RiskInput): {
  chance: number;
  reasons: string[];
} {
  let chance = 0.03;
  const reasons: string[] = [];
  if (booking.source === 'ota') {
    chance += 0.07;
    reasons.push('Booked through an OTA');
  }
  if (!payments.some((p) => p.kind === 'payment')) {
    chance += 0.05;
    reasons.push('No deposit');
  }
  const others = guestBookings.filter((b) => b.id !== booking.id);
  if (others.some((b) => b.status === 'cancelled')) {
    chance += 0.1;
    reasons.push('Cancelled a stay before');
  }
  if (others.some((b) => b.status === 'checked_out')) {
    chance -= 0.02;
    reasons.push('Has stayed before');
  }
  return { chance: Math.max(0.01, Math.round(chance * 100) / 100), reasons };
}

export interface OutlookInput {
  today: IsoDate;
  days: number;
  rooms: Room[];
  roomTypes: RoomType[];
  /** Every booking from `TYPICAL_WEEKS` before today on, and the guests' earlier ones. */
  bookings: Booking[];
  guests: Guest[];
  payments: Payment[];
  pricing: PricingConfig;
  events: LocalEvent[];
  weather: WeatherDay[];
  /** From the model's latest review; none without one. */
  signals?: RateSignal[];
}

/** The next `days` nights from today, and the arrivals in the next `RISK_DAYS` most likely to miss. */
export function buildOutlook(input: OutlookInput): {
  nights: NightOutlook[];
  arrivalRisks: ArrivalRisk[];
} {
  const { today, days, rooms, roomTypes, bookings, guests, payments, pricing, events, weather } =
    input;
  const signals = input.signals ?? [];
  const roomsTotal = rooms.filter((r) => r.status !== 'out_of_order').length;
  // The room types the hotel has rooms of, cheapest first.
  const types = roomTypes
    .filter((t) => rooms.some((r) => r.roomTypeId === t.id))
    .sort((a, b) => a.basePrice - b.basePrice);
  const typical = typicalOccupancy(bookings, rooms.length, today);

  const arriving = bookings.filter(
    (b) => b.status === 'confirmed' && b.checkIn >= today && b.checkIn < addDays(today, days),
  );
  const risks = arriving.map((booking) => ({
    booking,
    ...noShowChance({
      booking,
      guestBookings: bookings.filter((b) => b.guestId === booking.guestId),
      payments: payments.filter((p) => p.bookingId === booking.id),
    }),
  }));

  const nights = Array.from({ length: days }, (_, i): NightOutlook => {
    const date = addDays(today, i);
    const sold = roomsSold(bookings, date);
    const tonight = events.filter((e) => e.firstNight <= date && date <= e.lastNight);
    const nearby = events.filter(
      (e) => e.firstNight === addDays(date, 1) || e.lastNight === addDays(date, -1),
    );
    const forecast = weather.find((w) => w.date === date) ?? null;
    const current = adjustmentFor(date, pricing);
    const factors = [
      ...rateFactors({
        date,
        today,
        occupancy: roomsTotal ? sold / roomsTotal : 0,
        typical: typical[weekday(date)] ?? null,
        events: tonight,
        nearby,
        weather: forecast,
      }),
      ...insightFactors(date, signals),
    ];
    const suggested = suggestedPercent(factors, current);
    const expected = risks
      .filter((r) => r.booking.checkIn === date)
      .reduce((sum, r) => sum + r.chance, 0);
    return {
      date,
      roomsSold: sold,
      roomsTotal,
      typicalOccupancy:
        typical[weekday(date)] === null ? null : Math.round(typical[weekday(date)]! * 100) / 100,
      currentPercent: current,
      suggestedPercent: suggested,
      rates: types.map((t) => ({
        roomType: t.name,
        current: nightlyRate(date, t.basePrice, pricing, current),
        suggested: nightlyRate(date, t.basePrice, pricing, suggested),
      })),
      factors,
      events: tonight.map((e) => e.name),
      weather: forecast,
      expectedNoShows: Math.round(expected * 100) / 100,
    };
  });

  const arrivalRisks = risks
    .filter((r) => r.booking.checkIn < addDays(today, RISK_DAYS) && r.chance >= 0.1)
    .sort((a, b) => b.chance - a.chance || a.booking.checkIn.localeCompare(b.booking.checkIn))
    .slice(0, 8)
    .map(({ booking, chance, reasons }): ArrivalRisk => ({
      bookingId: booking.id,
      guestName: guests.find((g) => g.id === booking.guestId)?.name ?? 'Unknown guest',
      roomName: rooms.find((r) => r.id === booking.roomId)?.name ?? booking.roomId,
      checkIn: booking.checkIn,
      source: booking.source,
      chance,
      reasons,
    }));
  return { nights, arrivalRisks };
}

/** A conversation that may turn into a stay, as the review reads it. */
export interface OpenInquiry {
  id: string;
  receivedAt: string;
  subject: string | null;
  /** The guest's latest message, shortened. */
  message: string;
  /** From the extraction, when the conversation has been read. */
  checkIn: IsoDate | null;
  checkOut: IsoDate | null;
  adults: number | null;
}

/**
 * Conversations still open that ask for a stay, newest first: not archived or in the trash, not
 * declined or booked, and not about a booking the hotel already has.
 */
export function openInquiries(inquiries: Inquiry[]): OpenInquiry[] {
  return inquiries
    .filter(
      (i) =>
        !i.archivedAt &&
        !i.trashedAt &&
        !i.bookingId &&
        (i.status === 'new' || i.status === 'quoted' || i.status === 'replied') &&
        (i.parsed === null || i.parsed.kind === 'booking_request'),
    )
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, REVIEW_INQUIRIES)
    .flatMap((i): OpenInquiry[] => {
      const latest = i.messages.filter((m) => m.direction === 'in').at(-1);
      if (!latest) return [];
      return [
        {
          id: i.id,
          receivedAt: latest.sentAt,
          subject: i.subject,
          message: latest.body.slice(0, REVIEW_MESSAGE_CHARS),
          checkIn: i.parsed?.checkIn ?? null,
          checkOut: i.parsed?.checkOut ?? null,
          adults: i.parsed?.adults ?? null,
        },
      ];
    });
}

/** What the model reviews: the outlook by the rules alone, local events and open requests. */
export interface RateReviewInput {
  today: IsoDate;
  hotel: Pick<HotelProfile, 'name' | 'location' | 'country'>;
  /** `REVIEW_DAYS` nights, without insight factors. */
  nights: NightOutlook[];
  events: LocalEvent[];
  inquiries: OpenInquiry[];
}

/**
 * A fingerprint of what a review reads. Rate changes a manager makes leave it alone; bookings,
 * events, forecasts and messages that change what the rules see, or a new day, change it.
 */
export function reviewBasis(input: RateReviewInput): string {
  const text = JSON.stringify({
    today: input.today,
    hotel: input.hotel,
    nights: input.nights.map((n) => [
      n.date,
      n.roomsSold,
      n.roomsTotal,
      n.typicalOccupancy,
      n.factors.map((f) => f.label),
      n.weather?.kind ?? null,
    ]),
    events: input.events,
    inquiries: input.inquiries,
  });
  // FNV-1a, 32 bits: enough to tell one outlook from the next.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Signals kept from a review: those with nights in the reviewed window, cut to it. A signal whose
 * last night is before its first is dropped.
 */
export function reviewSignals(signals: RateSignal[], today: IsoDate, days: number): RateSignal[] {
  const last = addDays(today, days - 1);
  return signals
    .filter((s) => s.firstNight <= s.lastNight && s.lastNight >= today && s.firstNight <= last)
    .map((s) => ({
      ...s,
      firstNight: s.firstNight < today ? today : s.firstNight,
      lastNight: s.lastNight > last ? last : s.lastNight,
    }));
}
