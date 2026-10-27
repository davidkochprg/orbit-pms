import { describe, expect, it } from 'vitest';
import { bookingSchema } from './entities';

const booking = {
  id: 'bk_1',
  guestId: 'gst_1',
  roomId: 'rm_1',
  checkIn: '2026-12-20',
  checkOut: '2026-12-23',
  adults: 2,
  childAges: [4, 9],
  status: 'hold',
  holdExpiresAt: '2026-12-01T12:00:00.000Z',
  source: 'email',
  addons: { wellness: false, dogs: 0, extraBeds: 0 },
  priceSnapshot: null,
  notes: null,
};

describe('bookingSchema', () => {
  it('accepts a valid booking', () => {
    expect(bookingSchema.parse(booking)).toEqual(booking);
  });

  it('rejects a non-ISO date', () => {
    expect(bookingSchema.safeParse({ ...booking, checkIn: '20.12.2026' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(bookingSchema.safeParse({ ...booking, status: 'pending' }).success).toBe(false);
  });
});
