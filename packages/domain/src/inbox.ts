import type {
  BookingSource,
  Inquiry,
  InquiryChannel,
  InquiryExtraction,
  QuoteAddons,
  RoomKind,
} from '@orbit/shared';
import type { DateRange } from './dates';
import type { HotelPolicy } from './policy';

export interface StayRequest extends DateRange {
  adults: number;
  childAges: number[];
}

/** The stay a message asks for, or null if it is not a complete booking request. */
export function stayRequest(analysis: InquiryExtraction): StayRequest | null {
  const { kind, checkIn, checkOut, adults, childAges } = analysis;
  if (kind !== 'booking_request' || !checkIn || !checkOut || !adults) return null;
  if (checkOut <= checkIn) return null;
  return { checkIn, checkOut, adults, childAges };
}

/** Which kind of room the wishes allow: an apartment if asked for, or if a dog needs one. */
export function roomKindForWishes(
  wishes: InquiryExtraction['wishes'],
  policy: HotelPolicy,
): RoomKind | undefined {
  if (wishes.apartment) return 'apartment';
  if (wishes.dog && policy.dogsAllowedIn.length === 1) return policy.dogsAllowedIn[0];
  return undefined;
}

export function addonsForWishes(wishes: InquiryExtraction['wishes'], room = 0): QuoteAddons {
  // In a block of rooms, the dog stays in the first.
  return { wellness: wishes.wellness, dogs: wishes.dog && room === 0 ? 1 : 0, extraBeds: 0 };
}

const sourceForChannel: Record<InquiryChannel, BookingSource> = {
  email: 'email',
  phone: 'phone',
  web: 'web',
  ota: 'ota',
};

export function bookingSourceFor(inquiry: Inquiry): BookingSource {
  return sourceForChannel[inquiry.channel];
}

/** One option per room type, cheapest first, at most `max`. Input is sorted cheapest first. */
export function pickOptions<T extends { roomType: { id: string } }>(available: T[], max = 3): T[] {
  const seen = new Set<string>();
  return available.filter((r) => !seen.has(r.roomType.id) && seen.add(r.roomType.id)).slice(0, max);
}
