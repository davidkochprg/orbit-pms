import { addDays } from '@orbit/domain';
import type {
  AuditLogEntry,
  Booking,
  HousekeepingTask,
  IsoDate,
  Payment,
  Room,
  StaffMember,
} from '@orbit/shared';

/**
 * The last day and a half of the activity feed, so the demo opens with a history: yesterday's
 * arrivals and departures, payments taken, rooms cleaned, and a few changes Orbit made and staff
 * confirmed. Everything refers to seeded bookings, rooms and payments, and each staff change names
 * who on the team made it: the desk checks guests in and out, housekeeping cleans.
 */
export function buildActivity(
  bookings: Booking[],
  rooms: Room[],
  payments: Payment[],
  tasks: HousekeepingTask[],
  staff: StaffMember[],
  today: IsoDate,
  now: Date,
): AuditLogEntry[] {
  const yesterday = addDays(today, -1);
  const entries: Omit<AuditLogEntry, 'id'>[] = [];
  // Hours before `now`, so the feed reads "2 hours ago", "yesterday at 3 PM".
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
  const team = (roles: StaffMember['role'][]) =>
    staff.filter((m) => m.active && roles.includes(m.role)).map((m) => m.id);
  const desk = team(['receptionist', 'manager']);
  const cleaners = team(['housekeeping']);
  /** Takes turns on the shift, so the feed shows more than one name. */
  const by = (shift: string[], i: number) => {
    const id = shift.length > 0 ? shift[i % shift.length] : undefined;
    return id ? { by: id } : {};
  };

  const departed = bookings.filter((b) => b.checkOut === yesterday && b.status === 'checked_out');
  departed.slice(0, 6).forEach((b, i) => {
    entries.push({
      actor: 'user',
      action: 'booking.check_out',
      subjectId: b.id,
      payload: { from: 'checked_in', to: 'checked_out', ...by(desk, i) },
      createdAt: ago(24 - i * 0.4),
    });
    entries.push({
      actor: 'user',
      action: 'room.status',
      subjectId: b.roomId,
      payload: { from: 'dirty', to: 'clean', ...by(cleaners.length ? cleaners : desk, i) },
      createdAt: ago(21 - i * 0.5),
    });
  });

  const arrived = bookings.filter((b) => b.checkIn === yesterday && b.status === 'checked_in');
  arrived.slice(0, 6).forEach((b, i) => {
    entries.push({
      actor: 'user',
      action: 'booking.check_in',
      subjectId: b.id,
      payload: { from: 'confirmed', to: 'checked_in', ...by(desk, i + 1) },
      createdAt: ago(18 - i * 0.6),
    });
  });

  payments
    .filter((p) => p.paidOn === yesterday || p.paidOn === today)
    .slice(0, 6)
    .forEach((p, i) => {
      entries.push({
        actor: 'user',
        action: 'folio.payment',
        subjectId: p.bookingId,
        payload: { paymentId: p.id, amount: p.amount, method: p.method, ...by(desk, i) },
        // Taken through the day, at check-out and at the desk.
        createdAt: p.paidOn === today ? ago(1.5 + i * 0.3) : ago(23.5 - i * 1.3),
      });
    });

  // Orbit's share: a hold staff confirmed from the agent, the maintenance task a voice note
  // logged, and this morning's inspections.
  const hold = bookings.find((b) => b.status === 'hold');
  if (hold) {
    entries.push({
      actor: 'agent',
      action: 'booking.create_hold',
      subjectId: hold.id,
      payload: { roomId: hold.roomId, room: roomName(hold.roomId) },
      createdAt: ago(3),
    });
  }
  const repair = tasks.find((t) => t.type === 'maintenance');
  if (repair) {
    entries.push({
      actor: 'agent',
      action: 'task.create',
      subjectId: repair.roomId,
      payload: repair,
      createdAt: ago(2.2),
    });
  }
  const inspected = rooms.filter((r) => r.status === 'inspected').slice(0, 3);
  inspected.forEach((r, i) => {
    entries.push({
      actor: 'agent',
      action: 'room.status',
      subjectId: r.id,
      payload: { from: 'clean', to: 'inspected' },
      createdAt: ago(1 - i * 0.2),
    });
  });

  return entries
    .filter((e) => e.createdAt <= now.toISOString())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e, i) => ({ id: `aud_seed_${String(i + 1).padStart(3, '0')}`, ...e }));
}
