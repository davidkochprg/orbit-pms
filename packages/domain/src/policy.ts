import type { RoomKind } from '@orbit/shared';

export interface HotelPolicy {
  /** How long a hold blocks a room before it lapses. */
  holdHours: number;
  /** Room kinds where dogs may stay. */
  dogsAllowedIn: RoomKind[];
  /** How long a phone ID-scan link stays open. */
  idScanMinutes: number;
}

/** Who and what the guest book records, which depends on the country the hotel is in. */
export interface GuestBookRules {
  /** Where the hotel is. */
  homeCountry: string;
  /** Everyone in the room (Czech law), or only the guest who booked (US practice). */
  scope: 'everyone' | 'main_guest';
  /** Whether nationality and date of birth are recorded. */
  identity: boolean;
  /** Age from which a person needs an ID document, when their date of birth is known. */
  idDocumentMinAge: number;
  /** Whether guests from abroad give a home address. */
  foreignAddress: boolean;
}

/**
 * The guest-book rules for a country. In the US a hotel checks the ID of the guest who booked;
 * elsewhere the Czech rules apply, as in most of Europe: everyone in the room, with nationality
 * and date of birth, an ID document from 15 (Czech ID cards are compulsory then), and a home
 * address for guests from abroad.
 */
export function guestBookRulesFor(country: string): GuestBookRules {
  if (country === 'US') {
    return {
      homeCountry: 'US',
      scope: 'main_guest',
      identity: false,
      idDocumentMinAge: 18,
      foreignAddress: false,
    };
  }
  return {
    homeCountry: country,
    scope: 'everyone',
    identity: true,
    idDocumentMinAge: 15,
    foreignAddress: true,
  };
}

// TODO(David): confirm the real hold and pet policy.
export const hotelPolicy: HotelPolicy = {
  holdHours: 48,
  dogsAllowedIn: ['apartment'],
  idScanMinutes: 15,
};
