import type {
  BookingAction,
  BookingStatus,
  Currency,
  Language,
  PaymentMethod,
} from '@orbit/shared';
import { format, parseISO } from 'date-fns';

/**
 * How the hotel writes money, dates and times: its currency, US or European date style, and its
 * time zone. Set once the rates, profile and health load (`RegionProvider`); US until then.
 */
export interface DisplayRegion {
  currency: Currency;
  /** "Wed, Oct 28" and "3:30 PM" in the US; "Wed 28 Oct" and "15:30" elsewhere. */
  usDates: boolean;
  timeZone: string;
  /** Base prices per room (US) or per adult. */
  perRoom: boolean;
  /** Taxes go on top of prices on the bill (US) rather than being included. */
  taxAdded: boolean;
}

let region: DisplayRegion = {
  currency: 'USD',
  usDates: true,
  timeZone: 'America/Los_Angeles',
  perRoom: true,
  taxAdded: true,
};

export function setDisplayRegion(next: DisplayRegion): void {
  region = next;
}

export function displayRegion(): DisplayRegion {
  return region;
}

export function formatDate(date: string): string {
  return format(parseISO(date), region.usDates ? 'EEE, MMM d' : 'EEE d MMM');
}

/** "Mar 14, 1985", e.g. a date of birth, where the weekday is noise and the year matters. */
export function formatFullDate(date: string): string {
  return format(parseISO(date), region.usDates ? 'MMM d, yyyy' : 'd MMM yyyy');
}

/** "Wed" and "Oct 3" for a tape chart column header. */
export function formatDayHeader(date: string): { weekday: string; day: string } {
  const d = parseISO(date);
  return { weekday: format(d, 'EEE'), day: format(d, region.usDates ? 'MMM d' : 'd MMM') };
}

/** "Tuesday, October 27" for page titles. */
export function formatLongDate(date: string): string {
  return format(parseISO(date), region.usDates ? 'EEEE, MMMM d' : 'EEEE, d MMMM');
}

/** A moment in the hotel's time zone, e.g. "Oct 28, 3:30 PM". */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(region.usDates ? 'en-US' : 'en-GB', {
    timeZone: region.timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: region.usDates,
  }).format(new Date(iso));
}

/** A recent moment: only the time when it was today in the hotel, e.g. "3:30 PM", else the date too. */
export function formatRecent(iso: string, now: Date = new Date()): string {
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: region.timeZone }).format(d);
  if (day(new Date(iso)) !== day(now)) return formatDateTime(iso);
  return new Intl.DateTimeFormat(region.usDates ? 'en-US' : 'en-GB', {
    timeZone: region.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: region.usDates,
  }).format(new Date(iso));
}

/** "15:00" as the hotel writes a time of day: "3 PM" in the US. */
export function formatTimeOfDay(time: string): string {
  if (!region.usDates) return time;
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatRange(checkIn: string, checkOut: string): string {
  return `${formatDate(checkIn)} – ${formatDate(checkOut)}`;
}

/** A count with thousands grouped like the money: "1,458". */
export function formatCount(count: number): string {
  return new Intl.NumberFormat('en-US').format(count);
}

/** An amount in the hotel's currency: "$1,250", "-$150" or "12,500 CZK". */
export function formatMoney(amount: number, currency: Currency = region.currency): string {
  const digits = new Intl.NumberFormat('en-US').format(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return currency === 'USD' ? `${sign}$${digits}` : `${sign}${digits} ${currency}`;
}

/**
 * A stay's price as a guest would be quoted it: "$159 + tax" where taxes are added on the bill,
 * the amount alone where they are included.
 */
export function formatPrice(amount: number): string {
  return region.taxAdded ? `${formatMoney(amount)} + tax` : formatMoney(amount);
}

/** The currency's symbol or code, e.g. for an input suffix: "$" or "CZK". */
export function currencyMark(currency: Currency = region.currency): string {
  return currency === 'USD' ? '$' : currency;
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
