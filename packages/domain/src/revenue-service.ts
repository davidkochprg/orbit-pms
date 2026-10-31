import type {
  AuditActor,
  LocalEvent,
  LocalEventBody,
  PricingConfig,
  RateReview,
  RateSignal,
  RevenueOutlook,
  StaffMember,
  WeatherDay,
} from '@orbit/shared';
import { addDays, hotelToday } from './dates';
import { DomainError } from './errors';
import { currentPricing } from './rates';
import type { Repositories } from './repositories';
import {
  buildOutlook,
  openInquiries,
  REVIEW_DAYS,
  type RateReviewInput,
  reviewBasis,
  reviewSignals,
} from './revenue';
import { emptyHotelProfile } from './settings';
import { assertManager } from './staff';

export interface RevenueDeps {
  repos: Repositories;
  /** Used until a manager saves rates. */
  defaults: PricingConfig;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/**
 * The rate outlook, the local events behind it and the model's review of it. Event changes need a
 * manager and are audited; a review only changes what is suggested, never a rate.
 */
export function createRevenueService({ repos, defaults, clock, newId }: RevenueDeps) {
  async function load(weather: WeatherDay[] | null) {
    const today = hotelToday(clock());
    const [rooms, roomTypes, bookings, guests, payments, pricing, events, inquiries, profile] =
      await Promise.all([
        repos.rooms.listRooms(),
        repos.rooms.listRoomTypes(),
        repos.bookings.listBookings(),
        repos.guests.listGuests(),
        repos.billing.listPayments(),
        currentPricing(repos, defaults),
        repos.events.list(),
        repos.inquiries.listInquiries(),
        repos.settings.getProfile(),
      ]);
    const base = {
      today,
      rooms,
      roomTypes,
      bookings,
      guests,
      payments,
      pricing,
      events,
      weather: weather ?? [],
    };
    const { name, location, country } = profile ?? emptyHotelProfile;
    const end = addDays(today, REVIEW_DAYS);
    const input: RateReviewInput = {
      today,
      hotel: { name, location, country },
      nights: buildOutlook({ ...base, days: REVIEW_DAYS }).nights,
      events: events.filter((e) => e.lastNight >= today && e.firstNight < end),
      inquiries: openInquiries(inquiries),
    };
    return { base, input };
  }

  return {
    /**
     * The next `days` nights with suggested rates. `weather` is the forecast, loaded by the
     * caller; null when there is none, and the nights then go without it. Signals from the latest
     * review count until a new one replaces them.
     */
    async outlook(days: number, weather: WeatherDay[] | null): Promise<RevenueOutlook> {
      const [{ base, input }, review] = await Promise.all([load(weather), repos.rateReview.get()]);
      const { today, events } = base;
      const end = addDays(today, days);
      const { nights, arrivalRisks } = buildOutlook({
        ...base,
        days,
        signals: review?.signals ?? [],
      });
      const basis = reviewBasis(input);
      return {
        today,
        nights,
        events: events.filter((e) => e.lastNight >= today && e.firstNight < end),
        arrivalRisks,
        weatherAvailable: weather !== null && weather.length > 0,
        review: {
          basis,
          reviewedAt: review?.reviewedAt ?? null,
          current: review?.basis === basis,
        },
      };
    },

    /** What a review reads now, its fingerprint, and the review kept so far. */
    async reviewInput(weather: WeatherDay[] | null) {
      const [{ input }, review] = await Promise.all([load(weather), repos.rateReview.get()]);
      return { input, basis: reviewBasis(input), review };
    },

    /** Keeps a review's signals, cut to the nights it covered, in place of the last review. */
    async saveReview(input: RateReviewInput, signals: RateSignal[]): Promise<RateReview> {
      const review: RateReview = {
        basis: reviewBasis(input),
        reviewedAt: clock().toISOString(),
        signals: reviewSignals(signals, input.today, REVIEW_DAYS),
      };
      await repos.rateReview.save(review);
      return review;
    },

    listEvents: () => repos.events.list(),

    async createEvent(
      body: LocalEventBody,
      by: StaffMember | null,
      actor: AuditActor = 'user',
    ): Promise<LocalEvent> {
      assertManager(by);
      const event: LocalEvent = { id: newId('evt'), ...body, name: body.name.trim() };
      return repos.transaction(async (tx) => {
        await tx.events.create(event);
        await tx.audit.append({
          actor,
          action: 'event.create',
          subjectId: event.id,
          payload: { by: by.id, ...body },
        });
        return event;
      });
    },

    async deleteEvent(
      id: string,
      by: StaffMember | null,
      actor: AuditActor = 'user',
    ): Promise<void> {
      assertManager(by);
      await repos.transaction(async (tx) => {
        const event = (await tx.events.list()).find((e) => e.id === id);
        if (!event) throw new DomainError('not_found', `Event ${id} not found`);
        await tx.events.delete(id);
        await tx.audit.append({
          actor,
          action: 'event.delete',
          subjectId: id,
          payload: { by: by.id, name: event.name },
        });
      });
    },
  };
}

export type RevenueService = ReturnType<typeof createRevenueService>;
