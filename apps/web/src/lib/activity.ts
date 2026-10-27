import { z } from 'zod';
import { formatCzk } from '@/lib/format';

/** Plain-language names for audit actions, shared by the inspector and the activity page. */
export const activityLabels: Record<string, string> = {
  'booking.create_hold': 'Created a hold',
  'booking.create': 'Created a booking',
  'booking.confirm': 'Confirmed',
  'booking.register': 'Registered in the guest book',
  'booking.update_registration': 'Corrected the registration',
  'booking.check_in': 'Checked in',
  'booking.check_out': 'Checked out',
  'booking.cancel': 'Cancelled',
  'booking.move': 'Moved to another room',
  'booking.change_dates': 'Changed dates',
  'booking.reschedule': 'Rescheduled',
  'booking.update': 'Edited',
  'folio.charge': 'Added a charge',
  'folio.remove_charge': 'Removed a charge',
  'folio.payment': 'Took a payment',
  'folio.refund': 'Refunded',
  'guest.create': 'Added a guest',
  'guest.update': 'Edited a guest',
  'inquiry.decline': 'Declined a message',
  'inquiry.replied': 'Replied to a message',
  'room.status': 'Changed room status',
  'room.create': 'Added a room',
  'room.update': 'Edited a room',
  'room_type.create': 'Added a room type',
  'room_type.update': 'Edited a room type',
  'task.create': 'Added a task',
  'task.status': 'Updated a task',
  'settings.profile': 'Edited the hotel profile',
  'settings.pricing': 'Changed the rates',
  'staff.create': 'Added a team member',
  'staff.update': 'Changed a team member',
};

export function activityLabel(action: string): string {
  return activityLabels[action] ?? action;
}

const amountPayload = z.object({ amount: z.number(), label: z.string().optional() });
const paymentPayload = z.object({ amount: z.number(), method: z.string() });
const statusPayload = z.object({ from: z.string(), to: z.string() });
const totalPayload = z.object({
  total: z.object({ from: z.number().nullable(), to: z.number().nullable() }),
});
const changedPayload = z.object({ changed: z.array(z.string()) });

const words = (s: string) => s.replaceAll('_', ' ');

/** One short line from the entry's payload, or null when there is nothing worth showing. */
export function activityDetail(action: string, payload: unknown): string | null {
  if (action === 'folio.payment' || action === 'folio.refund') {
    const p = paymentPayload.safeParse(payload);
    return p.success ? `${formatCzk(p.data.amount)} by ${words(p.data.method)}` : null;
  }
  if (action === 'folio.charge' || action === 'folio.remove_charge') {
    const p = amountPayload.safeParse(payload);
    return p.success ? `${p.data.label ?? 'Charge'}, ${formatCzk(p.data.amount)}` : null;
  }
  if (action === 'room.status' || action === 'task.status') {
    const p = statusPayload.safeParse(payload);
    return p.success ? `${words(p.data.from)} → ${words(p.data.to)}` : null;
  }
  const total = totalPayload.safeParse(payload);
  if (total.success && total.data.total.from !== total.data.total.to) {
    const { from, to } = total.data.total;
    return `Total ${from === null ? '–' : formatCzk(from)} → ${to === null ? '–' : formatCzk(to)}`;
  }
  const changed = changedPayload.safeParse(payload);
  if (changed.success && changed.data.changed.length > 0) {
    return `Changed ${changed.data.changed
      .map((f) =>
        words(f)
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase(),
      )
      .join(', ')}`;
  }
  return null;
}
