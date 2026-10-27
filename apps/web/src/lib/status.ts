import type { BookingStatus, Room, RoomStatus, RoomType } from '@orbit/shared';

/** Token-backed color class per booking status (see the status tokens in index.css). */
export const bookingStatusColor: Record<BookingStatus, string> = {
  hold: 'bg-status-hold',
  confirmed: 'bg-status-confirmed',
  checked_in: 'bg-status-checked-in',
  checked_out: 'bg-status-checked-out',
  cancelled: 'bg-status-cancelled',
};

export const roomStatusColor: Record<RoomStatus, string> = {
  inspected: 'bg-room-inspected',
  clean: 'bg-room-clean',
  dirty: 'bg-room-dirty',
  out_of_order: 'bg-room-out-of-order',
};

export const roomStatusLabels: Record<RoomStatus, string> = {
  inspected: 'Inspected',
  clean: 'Clean',
  dirty: 'Dirty',
  out_of_order: 'Out of order',
};

export interface RoomGroup {
  roomType: RoomType | null;
  label: string;
  rooms: Room[];
}

/**
 * Rooms grouped by room type, rooms sorted by name within each group and groups ordered by their
 * first room, so the chart reads 101, 104, A1 top to bottom. Rooms whose type is unknown end up
 * in a trailing "Other" group.
 */
export function groupRoomsByType(rooms: Room[], roomTypes: RoomType[]): RoomGroup[] {
  const byName = (a: Room, b: Room) => a.name.localeCompare(b.name, 'en', { numeric: true });
  const groups: RoomGroup[] = roomTypes
    .map((roomType) => ({
      roomType,
      label: roomType.name,
      rooms: rooms.filter((r) => r.roomTypeId === roomType.id).sort(byName),
    }))
    .filter((g) => g.rooms.length > 0)
    .sort((a, b) => byName(a.rooms[0]!, b.rooms[0]!));
  const known = new Set(roomTypes.map((t) => t.id));
  const other = rooms.filter((r) => !known.has(r.roomTypeId)).sort(byName);
  if (other.length > 0) groups.push({ roomType: null, label: 'Other', rooms: other });
  return groups;
}
