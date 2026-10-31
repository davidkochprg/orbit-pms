import { createHotelService, hotelPolicy, usDemoPricing } from '@orbit/domain';
import { createMemoryRepositories } from '@orbit/domain/testing';
import type { IsoDate, Room, RoomType } from '@orbit/shared';

const roomTypes: RoomType[] = [
  {
    id: 'rt_queen',
    name: 'Queen room',
    maxAdults: 2,
    maxChildren: 1,
    basePrice: 189,
    description: '',
  },
  {
    id: 'rt_family',
    name: 'Family room',
    maxAdults: 2,
    maxChildren: 3,
    basePrice: 239,
    description: '',
  },
  {
    id: 'rt_cabin',
    name: 'Cabin suite',
    maxAdults: 4,
    maxChildren: 2,
    basePrice: 324,
    description: '',
  },
];

const rooms: Room[] = [
  { id: 'rm_101', name: '101', roomTypeId: 'rt_queen', kind: 'room', floor: 1, status: 'clean' },
  { id: 'rm_102', name: '102', roomTypeId: 'rt_queen', kind: 'room', floor: 1, status: 'clean' },
  { id: 'rm_103', name: '103', roomTypeId: 'rt_queen', kind: 'room', floor: 1, status: 'clean' },
  { id: 'rm_104', name: '104', roomTypeId: 'rt_queen', kind: 'room', floor: 1, status: 'clean' },
  { id: 'rm_201', name: '201', roomTypeId: 'rt_family', kind: 'room', floor: 2, status: 'clean' },
  { id: 'rm_202', name: '202', roomTypeId: 'rt_family', kind: 'room', floor: 2, status: 'clean' },
  { id: 'rm_a1', name: 'A1', roomTypeId: 'rt_cabin', kind: 'apartment', floor: 0, status: 'clean' },
];

/**
 * An empty seven-room US lodge on the demo's rates, so every inbox fixture gets real quoted
 * options for its reply draft, or a block for a group, exactly as the inbox pipeline builds them.
 */
export function buildDraftEvalHotel(today: IsoDate) {
  const now = new Date(`${today}T09:00:00Z`);
  const repos = createMemoryRepositories({ roomTypes, rooms }, () => now);
  let n = 0;
  return createHotelService({
    repos,
    pricing: usDemoPricing,
    policy: hotelPolicy,
    clock: () => now,
    newId: (p) => `${p}_${++n}`,
  });
}
