import type {
  AuditActor,
  LocalEvent,
  LocalEventBody,
  PricingConfig,
  RevenueOutlook,
  StaffMember,
  WeatherDay,
} from '@orbit/shared';
import { addDays, hotelToday } from './dates';
import { DomainError } from './errors';
import { currentPricing } from './rates';
import type { Repositories } from './repositories';
import { buildOutlook } from './revenue';
import { assertManager } from './staff';

export interface RevenueDeps {
  repos: Repositories;
  /** Used until a manager saves rates. */
  defaults: PricingConfig;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/** The rate outlook and the local events behind it. Event changes need a manager and are audited. */
export function createRevenueService({ repos, defaults, clock, newId }: RevenueDeps) {
  return {
    /**
     * The next `days` nights with suggested rates. `weather` is the forecast, loaded by the
     * caller; null when there is none, and the nights then go without it.
     */
    async outlook(days: number, weather: WeatherDay[] | null): Promise<RevenueOutlook> {
      const today = hotelToday(clock());
      const [rooms, roomTypes, bookings, guests, payments, pricing, events] = await Promise.all([
        repos.rooms.listRooms(),
        repos.rooms.listRoomTypes(),
        repos.bookings.listBookings(),
        repos.guests.listGuests(),
        repos.billing.listPayments(),
        currentPricing(repos, defaults),
        repos.events.list(),
      ]);
      const end = addDays(today, days);
      const { nights, arrivalRisks } = buildOutlook({
        today,
        days,
        rooms,
        roomTypes,
        bookings,
        guests,
        payments,
        pricing,
        events,
        weather: weather ?? [],
      });
      return {
        today,
        nights,
        events: events.filter((e) => e.lastNight >= today && e.firstNight < end),
        arrivalRisks,
        weatherAvailable: weather !== null && weather.length > 0,
      };
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
