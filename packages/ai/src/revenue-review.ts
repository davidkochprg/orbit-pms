import type { RateReviewInput, RecentPerformance } from '@orbit/domain';
import { formatMoney, type RateSignal, rateReviewOutputSchema } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { amountsInText } from './price-guard';
import { rateReviewPrompt, rateReviewSystemPrompt } from './prompts/revenue';
import { reasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (date: string) => weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
/** ISO weekdays, 1 for Monday, as the report numbers them. */
const isoWeekdays = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The past weeks as the model reads them: rooms rather than percents, like the nights ahead, and
 * rates in the hotel's currency.
 */
function recentWeeks(r: RecentPerformance, rooms: number) {
  const sold = (share: number) => `${Math.round(share * rooms)} of ${rooms} rooms`;
  const money = (amount: number) => formatMoney(amount, r.currency);
  return {
    from: r.from,
    until: r.to,
    soldOnAverage: sold(r.occupancy),
    averageRate: money(r.adr),
    byWeekday: r.byWeekday.map((w) => ({
      weekday: isoWeekdays[w.weekday],
      soldOnAverage: sold(w.occupancy),
      averageRate: w.roomNights > 0 ? money(w.adr) : null,
    })),
    arrivals: r.arrivals,
    averageStayNights: r.averageStay,
    staysByLength: r.stayLengths
      .filter((s) => s.arrivals > 0)
      .map((s) => ({
        nights:
          s.maxNights === null
            ? `${s.minNights} or more`
            : s.minNights === s.maxNights
              ? `${s.minNights}`
              : `${s.minNights} to ${s.maxNights}`,
        arrivals: s.arrivals,
      })),
    returningGuests: `${r.returningArrivals} of ${r.arrivals} arrivals`,
    bySource: r.bySource.map((s) => ({
      source: s.source,
      roomNights: s.roomNights,
      averageRate: money(s.adr),
    })),
    cancelled: `${Math.round(r.cancellationRate * 100)} in 100 bookings`,
  };
}

/** The review's input as the model reads it: weekdays spelled out, occupancy as text. */
export function reviewData(input: RateReviewInput) {
  return {
    hotel: input.hotel,
    today: `${weekday(input.today)} ${input.today}`,
    nights: input.nights.map((n) => ({
      night: `${weekday(n.date)} ${n.date}`,
      booked: `${n.roomsSold} of ${n.roomsTotal} rooms`,
      usualForWeekday:
        n.typicalOccupancy === null
          ? null
          : `${Math.round(n.typicalOccupancy * n.roomsTotal)} of ${n.roomsTotal} rooms`,
      rules: n.factors.map((f) => f.label),
      weather:
        n.weather &&
        `${n.weather.kind}, ${n.weather.tempMinC} to ${n.weather.tempMaxC} °C` +
          (n.weather.snowfallCm > 0 ? `, ${n.weather.snowfallCm} cm snow` : ''),
    })),
    events: input.events.map(({ name, firstNight, lastNight, impact }) => ({
      name,
      firstNight,
      lastNight,
      impact,
    })),
    inquiries: input.inquiries.map((i) => ({
      sent: `${weekday(i.receivedAt.slice(0, 10))} ${i.receivedAt.slice(0, 10)}`,
      subject: i.subject,
      message: i.message,
      ...(i.checkIn && { read: { checkIn: i.checkIn, checkOut: i.checkOut, adults: i.adults } }),
    })),
    ...(input.recent && {
      recentWeeks: recentWeeks(input.recent, input.nights[0]?.roomsTotal ?? 0),
    }),
  };
}

/** Whether a signal's words state a number the domain should set: a percent or a price. */
function statesANumber(signal: RateSignal): boolean {
  const text = `${signal.label} ${signal.reason}`;
  return /\d\s?(?:%|percent)/i.test(text) || amountsInText(text).length > 0;
}

export interface RateReviewerDeps {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}

/**
 * Reviews the outlook for what the rules can't see (one model call at `high` reasoning) and
 * returns graded signals; the domain turns them into percents. A signal that states a percent or
 * a price is dropped.
 */
export function createRateReviewer({ model, modelId, usage }: RateReviewerDeps) {
  return {
    async review(input: RateReviewInput): Promise<RateSignal[]> {
      const result = await generateText({
        model,
        system: rateReviewSystemPrompt,
        prompt: rateReviewPrompt(reviewData(input)),
        output: Output.object({ schema: rateReviewOutputSchema }),
        reasoning: reasoningEffort.rateReview,
        providerOptions: { meta: { strictJsonSchema: false } },
      });
      const tokens = fromSdkUsage(result.usage);
      await usage.record({
        feature: 'rate_review',
        model: modelId,
        tokens,
        audioSeconds: 0,
        costMicroUsd: tokenCostMicroUsd(tokens),
      });
      return result.output.signals.filter((s) => !statesANumber(s));
    },
  };
}

export type RateReviewer = ReturnType<typeof createRateReviewer>;
