import type {
  AuditActor,
  PricingConfig,
  RateAdjustment,
  Room,
  RoomBody,
  RoomType,
  RoomTypeBody,
  StaffMember,
} from '@orbit/shared';
import { DomainError } from './errors';
import type { Repositories } from './repositories';
import { assertManager } from './staff';

const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True for a real day of the year in `MM-DD`; 02-29 counts, since seasons repeat every year. */
export function isMonthDay(md: string): boolean {
  const match = /^(\d\d)-(\d\d)$/.exec(md);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!;
}

/**
 * Throws unless `quote()` can read the rates unambiguously: real season days with unique names,
 * child tiers in ascending age order, and one long-stay tier per length.
 */
export function assertValidPricing(pricing: PricingConfig): void {
  const names = new Set<string>();
  for (const season of pricing.seasons) {
    if (names.has(season.name)) {
      throw new DomainError('invalid_input', `Duplicate season ${season.name}`);
    }
    names.add(season.name);
    for (const md of [season.from, season.to]) {
      if (!isMonthDay(md)) {
        throw new DomainError('invalid_input', `Season ${season.name}: ${md} is not a day`);
      }
    }
  }
  pricing.childDiscounts.forEach((tier, i) => {
    const previous = pricing.childDiscounts[i - 1];
    if (previous && tier.maxAge <= previous.maxAge) {
      throw new DomainError(
        'invalid_input',
        'Child discount tiers must go up in age, each older than the one before',
      );
    }
  });
  const nights = new Set<string>();
  for (const adjustment of pricing.adjustments) {
    if (nights.has(adjustment.date)) {
      throw new DomainError(
        'invalid_input',
        `Two rate changes for the night of ${adjustment.date}`,
      );
    }
    nights.add(adjustment.date);
  }
  const lengths = new Set<number>();
  for (const tier of pricing.longStay) {
    if (lengths.has(tier.minNights)) {
      throw new DomainError(
        'invalid_input',
        `Two long-stay discounts for ${tier.minNights} nights`,
      );
    }
    lengths.add(tier.minNights);
  }
}

/** Top-level pricing fields that differ, for the audit log. */
export function changedPricingFields(before: PricingConfig, after: PricingConfig): string[] {
  return (Object.keys(after) as (keyof PricingConfig)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

/**
 * The adjustments after setting each of `nights` to its percent, sorted by date; 0 removes the
 * night's adjustment. Throws for a night given twice.
 */
export function applyAdjustments(
  current: RateAdjustment[],
  nights: RateAdjustment[],
): RateAdjustment[] {
  const byDate = new Map(current.map((a) => [a.date, a.percent]));
  const seen = new Set<string>();
  for (const { date, percent } of nights) {
    if (seen.has(date)) throw new DomainError('invalid_input', `The night of ${date} is set twice`);
    seen.add(date);
    if (percent === 0) byDate.delete(date);
    else byDate.set(date, percent);
  }
  return [...byDate]
    .map(([date, percent]) => ({ date, percent }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Each night whose percent would change, with what it was. */
export function adjustmentChanges(current: RateAdjustment[], nights: RateAdjustment[]) {
  return nights
    .map(({ date, percent }) => ({
      date,
      from: current.find((a) => a.date === date)?.percent ?? 0,
      to: percent,
    }))
    .filter((c) => c.from !== c.to);
}

/** The saved rates, or `defaults` until a manager has saved some. */
export async function currentPricing(
  repos: Repositories,
  defaults: PricingConfig,
): Promise<PricingConfig> {
  return (await repos.settings.getPricing()) ?? defaults;
}

/** Throws if another room already has this name, ignoring case and surrounding spaces. */
export function assertUniqueRoomName(rooms: Room[], name: string, exceptId?: string): void {
  const key = name.trim().toLowerCase();
  if (rooms.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === key)) {
    throw new DomainError('conflict', `There is already a room ${name}`);
  }
}

export interface RatesDeps {
  repos: Repositories;
  /** Used until a manager saves rates. */
  defaults: PricingConfig;
  newId: (prefix: string) => string;
}

/**
 * Rates, room types and rooms. Anyone may read them; changes need a manager and are audited.
 * Existing bookings keep the price they were quoted.
 */
export function createRatesService({ repos, defaults, newId }: RatesDeps) {
  async function loadRoomType(tx: Repositories, id: string): Promise<RoomType> {
    const roomType = (await tx.rooms.listRoomTypes()).find((t) => t.id === id);
    if (!roomType) throw new DomainError('not_found', `Room type ${id} not found`);
    return roomType;
  }

  return {
    getPricing: () => currentPricing(repos, defaults),

    /** Replaces the rates. A save that changes nothing writes no audit entry. */
    async updatePricing(pricing: PricingConfig, by: StaffMember | null): Promise<PricingConfig> {
      assertManager(by);
      assertValidPricing(pricing);
      return repos.transaction(async (tx) => {
        const before = await currentPricing(tx, defaults);
        const changed = changedPricingFields(before, pricing);
        if (changed.length === 0) return before;
        await tx.settings.savePricing(pricing);
        await tx.audit.append({
          actor: 'user',
          action: 'settings.pricing',
          subjectId: null,
          payload: { by: by.id, changed },
        });
        return pricing;
      });
    },

    /**
     * Sets nights' rates to a percent on top of their season, for every room type; 0 removes the
     * change. A manager does it on the Rates page; the agent's proposal runs once someone confirms
     * it. Nights that would not change are skipped, and nothing changing writes no audit entry.
     */
    async adjustRates(
      nights: RateAdjustment[],
      actor: AuditActor,
      by: StaffMember | null = null,
    ): Promise<PricingConfig> {
      if (actor === 'user') assertManager(by);
      return repos.transaction(async (tx) => {
        const before = await currentPricing(tx, defaults);
        const changes = adjustmentChanges(before.adjustments, nights);
        const adjustments = applyAdjustments(before.adjustments, nights);
        if (changes.length === 0) return before;
        const pricing = { ...before, adjustments };
        await tx.settings.savePricing(pricing);
        await tx.audit.append({
          actor,
          action: 'rates.adjust',
          subjectId: null,
          payload: { ...(by && { by: by.id }), nights: changes },
        });
        return pricing;
      });
    },

    async createRoomType(body: RoomTypeBody, by: StaffMember | null): Promise<RoomType> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        const roomType: RoomType = { id: newId('rt'), ...body };
        await tx.rooms.createRoomType(roomType);
        await tx.audit.append({
          actor: 'user',
          action: 'room_type.create',
          subjectId: roomType.id,
          payload: { by: by.id, name: roomType.name, basePrice: roomType.basePrice },
        });
        return roomType;
      });
    },

    async updateRoomType(
      id: string,
      body: RoomTypeBody,
      by: StaffMember | null,
    ): Promise<RoomType> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        const current = await loadRoomType(tx, id);
        const updated: RoomType = { id, ...body };
        const changed = (Object.keys(body) as (keyof RoomTypeBody)[]).filter(
          (key) => current[key] !== updated[key],
        );
        if (changed.length === 0) return current;
        await tx.rooms.updateRoomType(updated);
        await tx.audit.append({
          actor: 'user',
          action: 'room_type.update',
          subjectId: id,
          payload: {
            by: by.id,
            changed,
            basePrice: { from: current.basePrice, to: body.basePrice },
          },
        });
        return updated;
      });
    },

    /** A new room starts clean. */
    async createRoom(body: RoomBody, by: StaffMember | null): Promise<Room> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        await loadRoomType(tx, body.roomTypeId);
        assertUniqueRoomName(await tx.rooms.listRooms(), body.name);
        const room: Room = { id: newId('rm'), ...body, name: body.name.trim(), status: 'clean' };
        await tx.rooms.createRoom(room);
        await tx.audit.append({
          actor: 'user',
          action: 'room.create',
          subjectId: room.id,
          payload: { by: by.id, name: room.name, roomTypeId: room.roomTypeId },
        });
        return room;
      });
    },

    /** Renames a room or changes its type, kind or floor; managers only. */
    async updateRoom(
      id: string,
      body: RoomBody,
      by: StaffMember | null,
      actor: AuditActor = 'user',
    ): Promise<Room> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        const current = await tx.rooms.getRoom(id);
        if (!current) throw new DomainError('not_found', `Room ${id} not found`);
        await loadRoomType(tx, body.roomTypeId);
        assertUniqueRoomName(await tx.rooms.listRooms(), body.name, id);
        const updated: Room = { ...current, ...body, name: body.name.trim() };
        const changed = (Object.keys(body) as (keyof RoomBody)[]).filter(
          (key) => current[key] !== updated[key],
        );
        if (changed.length === 0) return current;
        await tx.rooms.updateRoom(updated);
        await tx.audit.append({
          actor,
          action: 'room.update',
          subjectId: id,
          payload: { by: by.id, changed },
        });
        return updated;
      });
    },
  };
}

export type RatesService = ReturnType<typeof createRatesService>;
