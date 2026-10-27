import type {
  ActivityItem,
  ActivityQuery,
  ActivitySubjectKind,
  AuditLogEntry,
  Booking,
  Guest,
  Inquiry,
  Room,
  RoomType,
  StaffMember,
} from '@orbit/shared';
import type { Repositories } from './repositories';

/** What an audit action is about, from its prefix: `folio.charge` is about a booking. */
export function subjectKindOf(action: string): ActivitySubjectKind | null {
  const prefix = action.split('.')[0];
  switch (prefix) {
    case 'booking':
    case 'folio':
      return 'booking';
    case 'room':
    case 'task':
      return 'room';
    case 'room_type':
      return 'room_type';
    case 'guest':
    case 'staff':
    case 'inquiry':
      return prefix;
    default:
      return null;
  }
}

/** The staff member ID a change recorded in its payload, if any. */
function byId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('by' in payload)) return null;
  return typeof payload.by === 'string' ? payload.by : null;
}

export interface ActivityLookup {
  bookings: Booking[];
  guests: Guest[];
  rooms: Room[];
  roomTypes: RoomType[];
  staff: StaffMember[];
  inquiries: Inquiry[];
}

/** Names each entry's subject, e.g. a booking as "Tomáš Novák, room 104", and who made it. */
export function describeActivity(entries: AuditLogEntry[], lookup: ActivityLookup): ActivityItem[] {
  const guest = new Map(lookup.guests.map((g) => [g.id, g.name]));
  const room = new Map(lookup.rooms.map((r) => [r.id, r.name]));
  const booking = new Map(lookup.bookings.map((b) => [b.id, b]));
  const roomType = new Map(lookup.roomTypes.map((t) => [t.id, t.name]));
  const staff = new Map(lookup.staff.map((s) => [s.id, s.name]));
  const inquiry = new Map(lookup.inquiries.map((i) => [i.id, i.senderName ?? i.subject]));

  function label(kind: ActivitySubjectKind, id: string): string | null | undefined {
    switch (kind) {
      case 'booking': {
        const b = booking.get(id);
        return b && `${guest.get(b.guestId) ?? 'Unknown guest'}, room ${room.get(b.roomId) ?? '?'}`;
      }
      case 'room': {
        const name = room.get(id);
        return name && `Room ${name}`;
      }
      case 'room_type':
        return roomType.get(id);
      case 'guest':
        return guest.get(id);
      case 'staff':
        return staff.get(id);
      case 'inquiry':
        return inquiry.get(id) ?? 'Message';
    }
  }

  return entries.map((entry) => {
    const kind = subjectKindOf(entry.action);
    const name = kind && entry.subjectId ? label(kind, entry.subjectId) : null;
    const by = byId(entry.payload);
    return {
      ...entry,
      subject: kind && entry.subjectId && name ? { kind, id: entry.subjectId, label: name } : null,
      byName: by ? (staff.get(by) ?? null) : null,
    };
  });
}

/** The hotel-wide activity feed: every change by staff or the agent, newest first. */
export function createActivityService({ repos }: { repos: Repositories }) {
  return {
    async list({ actor, limit }: ActivityQuery): Promise<ActivityItem[]> {
      const entries = await repos.audit.list({ limit, ...(actor && { actor }) });
      const bookingIds = new Set<string>();
      for (const e of entries) {
        if (e.subjectId && subjectKindOf(e.action) === 'booking') bookingIds.add(e.subjectId);
      }
      const bookings = await Promise.all(
        [...bookingIds].map((id) => repos.bookings.getBooking(id)),
      );
      return describeActivity(entries, {
        bookings: bookings.filter((b): b is Booking => b !== null),
        guests: await repos.guests.listGuests(),
        rooms: await repos.rooms.listRooms(),
        roomTypes: await repos.rooms.listRoomTypes(),
        staff: await repos.staff.list(),
        inquiries: await repos.inquiries.listInquiries(),
      });
    },
  };
}

export type ActivityService = ReturnType<typeof createActivityService>;
