import {
  createHotelService,
  createBillingService,
  createPendingActionService,
  createReportService,
  hotelPolicy,
  pricingConfig,
} from '@orbit/domain';
import { createMemoryRepositories } from '@orbit/domain/testing';
import type { Booking, RoomType } from '@orbit/shared';
import { createAgentTools } from './tools';

export const now = new Date('2026-05-10T08:00:00Z');

const double: RoomType = {
  id: 'rt_double',
  name: 'Double room',
  maxAdults: 2,
  maxChildren: 1,
  basePrice: 1000,
  description: '',
};

const base: Omit<Booking, 'id' | 'roomId' | 'checkIn' | 'checkOut'> = {
  guestId: 'gst_1',
  adults: 2,
  childAges: [],
  status: 'confirmed',
  holdExpiresAt: null,
  source: 'email',
  addons: { wellness: false, dogs: 0, extraBeds: 0 },
  priceSnapshot: null,
  notes: null,
};

/** A two-room hotel with Tomáš Novák in room 104 from today for two nights. */
export function setup() {
  const repos = createMemoryRepositories(
    {
      roomTypes: [double],
      rooms: [
        {
          id: 'rm_104',
          name: '104',
          roomTypeId: double.id,
          kind: 'room',
          floor: 1,
          status: 'clean',
        },
        {
          id: 'rm_201',
          name: '201',
          roomTypeId: double.id,
          kind: 'room',
          floor: 2,
          status: 'clean',
        },
      ],
      guests: [
        { id: 'gst_1', name: 'Tomáš Novák', email: null, phone: null, language: 'cs', notes: null },
      ],
      bookings: [
        { ...base, id: 'bk_1', roomId: 'rm_104', checkIn: '2026-05-10', checkOut: '2026-05-12' },
      ],
    },
    () => now,
  );
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const clock = () => now;
  const hotel = createHotelService({
    repos,
    pricing: pricingConfig,
    policy: hotelPolicy,
    clock,
    newId,
  });
  const billing = createBillingService({ repos, pricing: pricingConfig, clock, newId });
  const actions = createPendingActionService({ repos, hotel, billing, clock, newId });
  const reports = createReportService({ repos, pricing: pricingConfig });
  const tools = createAgentTools({
    hotel,
    billing,
    reports,
    actions,
    listRooms: () => repos.rooms.listRooms(),
  });
  return { repos, hotel, billing, actions, tools };
}

export const callOptions = { toolCallId: 'call_1', messages: [], context: {} };
