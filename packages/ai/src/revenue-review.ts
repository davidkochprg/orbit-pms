import type { RateReviewInput } from '@orbit/domain';
import { type RateSignal, rateReviewOutputSchema } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { amountsInText } from './price-guard';
import { rateReviewPrompt, rateReviewSystemPrompt } from './prompts/revenue';
import { reasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (date: string) => weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]!;

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
