import type { Room, RoomType } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { groupRoomsByType } from './status';

const type = (id: string, name: string): RoomType => ({
  id,
  name,
  maxAdults: 2,
  maxChildren: 1,
  basePrice: 1000,
  description: '',
});
const room = (id: string, name: string, roomTypeId: string): Room => ({
  id,
  name,
  roomTypeId,
  kind: 'room',
  floor: 1,
  status: 'clean',
});

describe('groupRoomsByType', () => {
  it('sorts rooms by name numerically and groups by their first room', () => {
    const groups = groupRoomsByType(
      [
        room('a', '119', 'dbl'),
        room('b', '102', 'sgl'),
        room('c', '110', 'dbl'),
        room('d', '9', 'sgl'),
      ],
      [type('dbl', 'Double'), type('sgl', 'Single')],
    );
    expect(groups.map((g) => [g.label, g.rooms.map((r) => r.name)])).toEqual([
      ['Single', ['9', '102']],
      ['Double', ['110', '119']],
    ]);
  });

  it('drops empty types and collects unknown ones under Other', () => {
    const groups = groupRoomsByType([room('a', '1', 'gone')], [type('sgl', 'Single')]);
    expect(groups).toEqual([{ roomType: null, label: 'Other', rooms: [room('a', '1', 'gone')] }]);
  });
});
