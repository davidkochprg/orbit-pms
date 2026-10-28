import type { Booking, HotelProfile, Room, RoomType } from '@orbit/shared';
import { emptyHotelProfile } from './settings';

export const double: RoomType = {
  id: 'rt_double',
  name: 'Double',
  maxAdults: 2,
  maxChildren: 1,
  basePrice: 1000,
  description: 'Test double room',
};

export const apartment: RoomType = {
  id: 'rt_apartment',
  name: 'Apartment',
  maxAdults: 4,
  maxChildren: 2,
  basePrice: 1200,
  description: 'Test apartment',
};

export function room(id: string, overrides: Partial<Room> = {}): Room {
  return {
    id,
    name: id,
    roomTypeId: double.id,
    kind: 'room',
    floor: 1,
    status: 'clean',
    ...overrides,
  };
}

export function booking(overrides: Partial<Booking> & Pick<Booking, 'roomId'>): Booking {
  return {
    id: `bk_${overrides.roomId}_${overrides.checkIn ?? 'x'}`,
    guestId: 'gst_test',
    checkIn: '2026-05-10',
    checkOut: '2026-05-13',
    adults: 2,
    childAges: [],
    status: 'confirmed',
    holdExpiresAt: null,
    source: 'email',
    addons: { wellness: false, dogs: 0, extraBeds: 0 },
    priceSnapshot: null,
    notes: null,
    ...overrides,
  };
}

/** A hotel in Czechia, where the guest book records everyone in the room. */
export const czechProfile: HotelProfile = { ...emptyHotelProfile, country: 'CZ', language: 'cs' };
