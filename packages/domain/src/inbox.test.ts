import type { InquiryExtraction } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { addonsForWishes, pickOptions, roomKindForWishes, stayRequest } from './inbox';
import { hotelPolicy } from './policy';

const analysis: InquiryExtraction = {
  rooms: null,
  kind: 'booking_request',
  language: 'de',
  guestName: 'Test',
  checkIn: '2026-11-06',
  checkOut: '2026-11-10',
  adults: 2,
  childAges: [4],
  wishes: { wellness: false, dog: false, apartment: false },
  question: null,
};

describe('stayRequest', () => {
  it('returns the stay for a complete booking request', () => {
    expect(stayRequest(analysis)).toEqual({
      checkIn: '2026-11-06',
      checkOut: '2026-11-10',
      adults: 2,
      childAges: [4],
    });
  });

  it('returns null for questions, missing fields and reversed dates', () => {
    expect(stayRequest({ ...analysis, kind: 'question' })).toBeNull();
    expect(stayRequest({ ...analysis, checkOut: null })).toBeNull();
    expect(stayRequest({ ...analysis, adults: null })).toBeNull();
    expect(stayRequest({ ...analysis, checkOut: '2026-11-06' })).toBeNull();
  });
});

describe('roomKindForWishes', () => {
  it('sends dogs and apartment requests to apartments', () => {
    const none = { wellness: false, dog: false, apartment: false };
    expect(roomKindForWishes(none, hotelPolicy)).toBeUndefined();
    expect(roomKindForWishes({ ...none, apartment: true }, hotelPolicy)).toBe('apartment');
    expect(roomKindForWishes({ ...none, dog: true }, hotelPolicy)).toBe('apartment');
    expect(
      roomKindForWishes(
        { ...none, dog: true },
        { ...hotelPolicy, dogsAllowedIn: ['room', 'apartment'] },
      ),
    ).toBeUndefined();
  });
});

describe('addonsForWishes', () => {
  it('adds wellness and one dog', () => {
    expect(addonsForWishes({ wellness: true, dog: true, apartment: false })).toEqual({
      wellness: true,
      dogs: 1,
      extraBeds: 0,
    });
  });
  it('puts the dog in the first room of a block only', () => {
    const wishes = { wellness: true, dog: true, apartment: false };
    expect(addonsForWishes(wishes, 1)).toEqual({ wellness: true, dogs: 0, extraBeds: 0 });
  });
});

describe('pickOptions', () => {
  it('keeps the first room of each type, up to the limit', () => {
    const rooms = ['a', 'a', 'b', 'c', 'd'].map((t, i) => ({ id: i, roomType: { id: t } }));
    expect(pickOptions(rooms).map((r) => r.id)).toEqual([0, 2, 3]);
    expect(pickOptions(rooms, 1).map((r) => r.id)).toEqual([0]);
  });
});
