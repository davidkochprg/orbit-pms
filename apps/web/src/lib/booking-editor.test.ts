import type { Booking } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  bookingPatch,
  createBookingInput,
  editBookingForm,
  newBookingForm,
  roomOptionsQuery,
} from './booking-editor';

const booking: Booking = {
  id: 'bk_1',
  guestId: 'gst_1',
  roomId: 'rm_104',
  checkIn: '2026-10-27',
  checkOut: '2026-10-30',
  adults: 2,
  childAges: [5],
  status: 'confirmed',
  holdExpiresAt: null,
  source: 'email',
  addons: { wellness: false, dogs: 0, extraBeds: 0 },
  priceSnapshot: null,
  notes: null,
};

describe('newBookingForm', () => {
  it('starts tonight for one night, as a hold for a new guest', () => {
    const form = newBookingForm('2026-10-27');
    expect(form).toMatchObject({
      checkIn: '2026-10-27',
      checkOut: '2026-10-28',
      adults: 2,
      status: 'hold',
      guest: { mode: 'new', name: '' },
    });
  });

  it('takes what the caller knows', () => {
    const form = newBookingForm('2026-10-27', {
      roomId: 'rm_201',
      checkIn: '2026-11-03',
      guestId: 'gst_9',
    });
    expect(form).toMatchObject({
      roomId: 'rm_201',
      checkIn: '2026-11-03',
      checkOut: '2026-11-04',
      guest: { mode: 'existing', guestId: 'gst_9' },
    });
  });
});

describe('roomOptionsQuery', () => {
  it('asks only once the stay is complete', () => {
    const form = editBookingForm(booking);
    expect(roomOptionsQuery(form, 'bk_1')).toMatchObject({
      checkIn: '2026-10-27',
      adults: 2,
      excludeBookingId: 'bk_1',
    });
    expect(roomOptionsQuery({ ...form, checkOut: '2026-10-27' })).toBeNull();
    expect(roomOptionsQuery({ ...form, checkIn: '' })).toBeNull();
    expect(roomOptionsQuery({ ...form, adults: 0 })).toBeNull();
  });
});

describe('bookingPatch', () => {
  it('is empty when nothing changed', () => {
    expect(bookingPatch(booking, editBookingForm(booking))).toEqual({});
  });

  it('holds only the changed fields, with empty notes as null', () => {
    const form = { ...editBookingForm(booking), adults: 1, roomId: 'rm_201', notes: '  ' };
    expect(bookingPatch(booking, form)).toEqual({ adults: 1, roomId: 'rm_201' });
    expect(bookingPatch(booking, { ...form, notes: ' Late ' })).toMatchObject({ notes: 'Late' });
  });
});

describe('createBookingInput', () => {
  const form = { ...newBookingForm('2026-10-27'), roomId: 'rm_201' };

  it('needs a room and a guest', () => {
    expect(createBookingInput({ ...form, roomId: null })).toBeNull();
    expect(createBookingInput(form)).toBeNull();
    expect(createBookingInput({ ...form, guest: { mode: 'existing', guestId: null } })).toBeNull();
  });

  it('builds a new guest from the form, empty fields as null', () => {
    const input = createBookingInput({
      ...form,
      status: 'confirmed',
      guest: { mode: 'new', name: ' Ana Test ', email: '', phone: '', language: 'en' },
    });
    expect(input).toMatchObject({
      guest: { name: 'Ana Test', email: null, phone: null, language: 'en' },
      roomId: 'rm_201',
      status: 'confirmed',
      notes: null,
    });
  });
});
