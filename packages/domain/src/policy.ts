import type { RoomKind } from '@orbit/shared';

export interface HotelPolicy {
  /** How long a hold blocks a room before it lapses. */
  holdHours: number;
  /** Room kinds where dogs may stay. */
  dogsAllowedIn: RoomKind[];
  /** Where the hotel is; guests from other countries also give a home address. */
  homeCountry: string;
  /** Age from which a guest-book entry needs an ID document (Czech ID cards are compulsory at 15). */
  idDocumentMinAge: number;
  /** How long a phone ID-scan link stays open. */
  idScanMinutes: number;
}

// TODO(David): confirm the real hold and pet policy.
export const hotelPolicy: HotelPolicy = {
  holdHours: 48,
  dogsAllowedIn: ['apartment'],
  homeCountry: 'CZ',
  idDocumentMinAge: 15,
  idScanMinutes: 15,
};
