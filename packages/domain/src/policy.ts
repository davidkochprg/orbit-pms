import type { RoomKind } from '@orbit/shared';

export interface HotelPolicy {
  /** How long a hold blocks a room before it lapses. */
  holdHours: number;
  /** Room kinds where dogs may stay. */
  dogsAllowedIn: RoomKind[];
}

// TODO(David): confirm the real hold and pet policy.
export const hotelPolicy: HotelPolicy = {
  holdHours: 48,
  dogsAllowedIn: ['apartment'],
};
