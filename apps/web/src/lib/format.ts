import type { BookingAction, BookingStatus, Language, PaymentMethod } from '@orbit/shared';
import { format, parseISO } from 'date-fns';

export function formatDate(date: string): string {
  return format(parseISO(date), 'EEE d MMM');
}

/** "14 Mar 1985", e.g. a date of birth, where the weekday is noise and the year matters. */
export function formatFullDate(date: string): string {
  return format(parseISO(date), 'd MMM yyyy');
}

/** "Wed" and "3 Oct" for a tape chart column header. */
export function formatDayHeader(date: string): { weekday: string; day: string } {
  const d = parseISO(date);
  return { weekday: format(d, 'EEE'), day: format(d, 'd MMM') };
}

/** "Tuesday, 27 October" for page titles. */
export function formatLongDate(date: string): string {
  return format(parseISO(date), 'EEEE, d MMMM');
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), 'd MMM, HH:mm');
}

export function formatRange(checkIn: string, checkOut: string): string {
  return `${formatDate(checkIn)} – ${formatDate(checkOut)}`;
}

export function formatCzk(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)} CZK`;
}

export function formatParty(adults: number, childAges: number[]): string {
  const parts = [`${adults} adult${adults === 1 ? '' : 's'}`];
  if (childAges.length > 0) {
    parts.push(
      `${childAges.length} child${childAges.length === 1 ? '' : 'ren'} (${childAges.join(', ')})`,
    );
  }
  return parts.join(', ');
}

export const statusLabels: Record<BookingStatus, string> = {
  hold: 'Hold',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
};

export const actionLabels: Record<BookingAction, string> = {
  confirm: 'Confirm',
  check_in: 'Check in',
  check_out: 'Check out',
  cancel: 'Cancel booking',
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
};

export const languageLabels: Record<Language, string> = {
  cs: 'Czech',
  de: 'German',
  en: 'English',
  pl: 'Polish',
};

/** Up to two initials for an avatar: "Jana Nováková" → "JN". */
/**
 * A stable hue turn for a person's avatar orb, from -36 to 36 degrees, so neighbours in a list
 * differ a little while every orb stays in the same cool family.
 */
export function orbShift(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  return (Math.abs(hash) % 9) * 9 - 36;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words;
  return letters
    .map((w) => w?.[0] ?? '')
    .join('')
    .toUpperCase();
}
