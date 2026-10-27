export interface HotelPolicy {
  /** How long a hold blocks a room before it lapses. */
  holdHours: number;
}

// TODO(David): confirm the real hold policy.
export const hotelPolicy: HotelPolicy = {
  holdHours: 48,
};
