import type {
  Booking,
  BookingPatch,
  BookingSource,
  CreateBookingInput,
  Language,
  QuoteAddons,
  RoomOptionsQuery,
} from '@orbit/shared';
import { addDaysIso, isIsoDate } from '@/lib/tape-chart';

export type GuestChoice =
  | { mode: 'existing'; guestId: string | null }
  | { mode: 'new'; name: string; email: string; phone: string; language: Language };

/** What the booking editor holds while staff fill it in. */
export interface BookingForm {
  checkIn: string;
  checkOut: string;
  adults: number;
  childAges: number[];
  addons: QuoteAddons;
  roomId: string | null;
  source: BookingSource;
  notes: string;
  status: 'hold' | 'confirmed';
  guest: GuestChoice;
  inquiryId: string | null;
}

/** Anything a caller already knows when it opens "New booking", e.g. the cell clicked. */
export interface NewBookingPrefill {
  roomId?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  childAges?: number[];
  addons?: QuoteAddons;
  source?: BookingSource;
  notes?: string | null;
  guestId?: string;
  newGuest?: { name: string; email: string; language: Language };
  inquiryId?: string;
}

const noAddons: QuoteAddons = { wellness: false, dogs: 0, extraBeds: 0 };

export const sourceLabels: Record<BookingSource, string> = {
  phone: 'Phone',
  email: 'Email',
  walk_in: 'Walk-in',
  web: 'Website',
  ota: 'OTA',
};

/** A new booking's form; a new guest starts in the hotel's working `language`. */
export function newBookingForm(
  today: string,
  prefill: NewBookingPrefill = {},
  language: Language = 'en',
): BookingForm {
  const checkIn = prefill.checkIn ?? today;
  return {
    checkIn,
    checkOut:
      prefill.checkOut ?? (isIsoDate(checkIn) ? addDaysIso(checkIn, 1) : addDaysIso(today, 1)),
    adults: prefill.adults ?? 2,
    childAges: prefill.childAges ?? [],
    addons: prefill.addons ?? noAddons,
    roomId: prefill.roomId ?? null,
    source: prefill.source ?? 'phone',
    notes: prefill.notes ?? '',
    status: 'hold',
    guest: prefill.newGuest
      ? { mode: 'new', ...prefill.newGuest, phone: '' }
      : prefill.guestId
        ? { mode: 'existing', guestId: prefill.guestId }
        : { mode: 'new', name: '', email: '', phone: '', language },
    inquiryId: prefill.inquiryId ?? null,
  };
}

export function editBookingForm(booking: Booking): BookingForm {
  return {
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    adults: booking.adults,
    childAges: [...booking.childAges],
    addons: { ...booking.addons },
    roomId: booking.roomId,
    source: booking.source,
    notes: booking.notes ?? '',
    status: booking.status === 'hold' ? 'hold' : 'confirmed',
    guest: { mode: 'existing', guestId: booking.guestId },
    inquiryId: null,
  };
}

/** The availability query for the form, or null while the stay is incomplete. */
export function roomOptionsQuery(
  form: BookingForm,
  excludeBookingId?: string,
): RoomOptionsQuery | null {
  if (!isIsoDate(form.checkIn) || !isIsoDate(form.checkOut) || form.checkOut <= form.checkIn) {
    return null;
  }
  if (form.adults < 1) return null;
  return {
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    adults: form.adults,
    childAges: form.childAges,
    addons: form.addons,
    ...(excludeBookingId && { excludeBookingId }),
  };
}

const notesValue = (notes: string) => (notes.trim() === '' ? null : notes.trim());

/** Only the fields the form changed, so the server applies exactly the edit. */
export function bookingPatch(original: Booking, form: BookingForm): BookingPatch {
  const next: Required<BookingPatch> = {
    roomId: form.roomId ?? original.roomId,
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    adults: form.adults,
    childAges: form.childAges,
    addons: form.addons,
    source: form.source,
    notes: notesValue(form.notes),
  };
  const patch: BookingPatch = {};
  for (const key of Object.keys(next) as (keyof BookingPatch)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(original[key])) {
      Object.assign(patch, { [key]: next[key] });
    }
  }
  return patch;
}

/** The request for a new booking, or null until a room and a guest are chosen. */
export function createBookingInput(form: BookingForm): CreateBookingInput | null {
  if (!form.roomId) return null;
  const guest =
    form.guest.mode === 'existing'
      ? form.guest.guestId && { guestId: form.guest.guestId }
      : form.guest.name.trim() && {
          name: form.guest.name.trim(),
          email: form.guest.email.trim() || null,
          phone: form.guest.phone.trim() || null,
          language: form.guest.language,
        };
  if (!guest) return null;
  return {
    guest,
    roomId: form.roomId,
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    adults: form.adults,
    childAges: form.childAges,
    addons: form.addons,
    source: form.source,
    notes: notesValue(form.notes),
    inquiryId: form.inquiryId,
    status: form.status,
  };
}
