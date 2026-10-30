import type { Inquiry, InquiryExtraction } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { createKnockOnService, planRelocations } from './knock-on';
import { hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createHotelService } from './service';
import { apartment, booking, czechProfile, double, room } from './test-fixtures';
import { conversation, createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T15:00:00Z');
const today = '2026-05-10';
const guests = [
  { id: 'gst_a', name: 'Anna Example' },
  { id: 'gst_b', name: 'Ben Sample' },
];
const broken = room('rm_1', { name: '1', status: 'out_of_order' });

const plan = (rooms = [broken], bookings = [booking({ roomId: 'rm_1' })]) =>
  planRelocations({
    room: broken,
    rooms,
    roomTypes: [double, apartment],
    bookings,
    guests,
    policy: hotelPolicy,
    today,
    now,
  });

describe('planRelocations', () => {
  it('moves a stay to a free room of the same type before another type', () => {
    const moves = plan([
      broken,
      room('rm_apt', { name: 'A1', roomTypeId: apartment.id, kind: 'apartment' }),
      room('rm_2', { name: '2' }),
    ]);
    expect(moves).toEqual([
      expect.objectContaining({ toRoomId: 'rm_2', toRoomName: '2', sameType: true }),
    ]);
  });

  it('offers another type the party fits when no room of the same type is free', () => {
    const moves = plan(
      [
        broken,
        room('rm_2', { name: '2' }),
        room('rm_apt', { name: 'A1', roomTypeId: apartment.id, kind: 'apartment' }),
      ],
      [
        booking({ id: 'bk_moving', roomId: 'rm_1' }),
        booking({ id: 'bk_other', roomId: 'rm_2', checkIn: '2026-05-11', checkOut: '2026-05-12' }),
      ],
    );
    expect(moves).toEqual([
      expect.objectContaining({ bookingId: 'bk_moving', toRoomId: 'rm_apt', sameType: false }),
    ]);
  });

  it('keeps a dog in a room kind where dogs may stay', () => {
    const moves = plan(
      [
        broken,
        room('rm_2', { name: '2' }),
        room('rm_apt', { name: 'A1', roomTypeId: apartment.id, kind: 'apartment' }),
      ],
      [booking({ roomId: 'rm_1', addons: { wellness: false, dogs: 1, extraBeds: 0 } })],
    );
    expect(moves[0]).toMatchObject({ toRoomId: 'rm_apt' });
  });

  it('does not give the same free room to two overlapping stays', () => {
    const moves = plan(
      [broken, room('rm_2', { name: '2' })],
      [
        booking({ id: 'bk_first', roomId: 'rm_1', checkIn: '2026-05-10', checkOut: '2026-05-12' }),
        booking({ id: 'bk_second', roomId: 'rm_1', checkIn: '2026-05-11', checkOut: '2026-05-13' }),
      ],
    );
    expect(moves.map((m) => m.toRoomId)).toEqual(['rm_2', null]);
  });

  it('lets back-to-back stays share the free room, as turnovers do', () => {
    const moves = plan(
      [broken, room('rm_2', { name: '2' })],
      [
        booking({ id: 'bk_first', roomId: 'rm_1', checkIn: '2026-05-10', checkOut: '2026-05-12' }),
        booking({ id: 'bk_second', roomId: 'rm_1', checkIn: '2026-05-12', checkOut: '2026-05-14' }),
      ],
    );
    expect(moves.map((m) => m.toRoomId)).toEqual(['rm_2', 'rm_2']);
  });

  it('prefers a ready room for a guest arriving today', () => {
    const moves = plan(
      [broken, room('rm_2', { name: '2', status: 'dirty' }), room('rm_3', { name: '3' })],
      [booking({ roomId: 'rm_1', checkIn: today, checkOut: '2026-05-12' })],
    );
    expect(moves[0]).toMatchObject({ toRoomId: 'rm_3' });
  });

  it('moves only stays in house or arriving within a week', () => {
    const moves = plan(
      [broken, room('rm_2', { name: '2' })],
      [
        booking({ id: 'bk_in', roomId: 'rm_1', checkIn: '2026-05-08', status: 'checked_in' }),
        booking({ id: 'bk_week', roomId: 'rm_1', checkIn: '2026-05-16', checkOut: '2026-05-18' }),
        booking({ id: 'bk_later', roomId: 'rm_1', checkIn: '2026-05-17', checkOut: '2026-05-19' }),
      ],
    );
    expect(moves.map((m) => m.bookingId)).toEqual(['bk_in', 'bk_week']);
  });

  it('leaves out stays that are over, cancelled or lapsed', () => {
    const moves = plan(
      [broken, room('rm_2', { name: '2' })],
      [
        booking({ id: 'bk_past', roomId: 'rm_1', checkIn: '2026-05-05', checkOut: today }),
        booking({ id: 'bk_cancelled', roomId: 'rm_1', status: 'cancelled' }),
        booking({
          id: 'bk_lapsed',
          roomId: 'rm_1',
          status: 'hold',
          holdExpiresAt: '2026-05-09T12:00:00Z',
        }),
      ],
    );
    expect(moves).toEqual([]);
  });
});

const request = (overrides: Partial<InquiryExtraction> = {}): InquiryExtraction =>
  ({
    kind: 'booking_request',
    language: 'en',
    guestName: 'Chris Example',
    checkIn: '2026-05-20',
    checkOut: '2026-05-22',
    adults: 2,
    childAges: [],
    wishes: { wellness: false, dog: false, apartment: false },
    ...overrides,
  }) as InquiryExtraction;

function setup(inquiries: Inquiry[], rooms = [broken, room('rm_2', { name: '2' })]) {
  const repos = createMemoryRepositories(
    {
      profile: czechProfile,
      roomTypes: [double],
      rooms,
      guests: guests.map((g) => ({ ...g, email: null, phone: null, language: 'en', notes: null })),
      bookings: [
        booking({ id: 'bk_broken', guestId: 'gst_a', roomId: 'rm_1', checkIn: today }),
        booking({ id: 'bk_full', roomId: 'rm_2', checkIn: '2026-05-19', checkOut: '2026-05-23' }),
      ],
      inquiries,
    },
    () => now,
  );
  let n = 0;
  const hotel = createHotelService({
    repos,
    pricing: pricingConfig,
    policy: hotelPolicy,
    clock: () => now,
    newId: (p) => `${p}_${++n}`,
  });
  return {
    repos,
    knockOns: createKnockOnService({ repos, hotel, policy: hotelPolicy, clock: () => now }),
  };
}

const unanswered = (parsed: InquiryExtraction): Inquiry => ({
  ...conversation({ id: 'inq_1', body: 'Do you have a room?' }),
  parsed,
  suggestion: {
    options: [],
    note: 'Nothing free',
    draft: null,
    draftLanguage: null,
    draftTranslation: null,
  },
  status: 'new',
});

describe('knock-on service', () => {
  it('lists the stays to move out of an out-of-order room', async () => {
    const { knockOns } = setup(
      [],
      [broken, room('rm_2', { name: '2' }), room('rm_3', { name: '3' })],
    );
    expect(await knockOns.list()).toEqual([
      expect.objectContaining({
        kind: 'relocate',
        roomName: '1',
        moves: [
          expect.objectContaining({
            bookingId: 'bk_broken',
            guestName: 'Anna Example',
            toRoomId: 'rm_2',
          }),
        ],
      }),
    ]);
  });

  it('moves the stays it is asked to', async () => {
    const { knockOns, repos } = setup([], [broken, room('rm_3', { name: '3' })]);
    await knockOns.relocate({ moves: [{ bookingId: 'bk_broken', roomId: 'rm_3' }] }, 'user');
    expect(repos.state.bookings.find((b) => b.id === 'bk_broken')?.roomId).toBe('rm_3');
    expect(await knockOns.list()).toEqual([]);
  });

  it('notices a request read when nothing was free once a room is free for it', async () => {
    const { knockOns, repos } = setup([unanswered(request())], [room('rm_2', { name: '2' })]);
    expect(await knockOns.list()).toEqual([]);

    repos.state.bookings = repos.state.bookings.map((b) =>
      b.id === 'bk_full' ? { ...b, status: 'cancelled' } : b,
    );
    expect(await knockOns.list()).toEqual([
      expect.objectContaining({
        kind: 'opening',
        inquiryId: 'inq_1',
        guestName: 'Chris Example',
        checkIn: '2026-05-20',
        rooms: 1,
      }),
    ]);
  });

  it('ignores requests already offered a room, settled or in the past', async () => {
    const { knockOns } = setup(
      [
        { ...unanswered(request()), id: 'inq_booked', bookingId: 'bk_x' },
        { ...unanswered(request()), id: 'inq_declined', status: 'declined' },
        {
          ...unanswered(request({ checkIn: '2026-05-01', checkOut: '2026-05-03' })),
          id: 'inq_old',
        },
      ],
      [room('rm_9', { name: '9' })],
    );
    expect(await knockOns.list()).toEqual([]);
  });
});
