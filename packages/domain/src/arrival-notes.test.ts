import type { Guest } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { arrivalNotesDue, createArrivalNoteService } from './arrival-notes';
import { createInboxService } from './inbox-service';
import { hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createHotelService } from './service';
import { booking, double, room } from './test-fixtures';
import { conversation, createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const guest = (id: string, name: string, email: string | null): Guest => ({
  id,
  name,
  email,
  phone: null,
  language: 'de',
  notes: null,
});
const guests = [
  guest('gst_a', 'Anna Beispiel', 'anna@example.com'),
  guest('gst_b', 'Bruno Beispiel', 'bruno@example.com'),
  guest('gst_c', 'Carla Beispiel', null),
];
const rooms = [room('rm_1', { name: '101' }), room('rm_2', { name: '102' })];
const bookings = [
  booking({ id: 'bk_b', guestId: 'gst_b', roomId: 'rm_1', checkIn: '2026-05-11' }),
  booking({ id: 'bk_a', guestId: 'gst_a', roomId: 'rm_2', checkIn: '2026-05-11', childAges: [6] }),
  // No email, a hold, and a later arrival: none of them is due.
  booking({ id: 'bk_c', guestId: 'gst_c', roomId: 'rm_1', checkIn: '2026-05-11' }),
  booking({ id: 'bk_h', guestId: 'gst_a', roomId: 'rm_1', checkIn: '2026-05-11', status: 'hold' }),
  booking({ id: 'bk_later', guestId: 'gst_b', roomId: 'rm_2', checkIn: '2026-05-12' }),
];

describe('arrivalNotesDue', () => {
  const due = (inquiries = [conversation({ id: 'inq_x' })]) =>
    arrivalNotesDue({
      date: '2026-05-11',
      bookings,
      guests,
      rooms,
      roomTypes: [double],
      inquiries,
    });

  it("lists the day's confirmed arrivals with an email, by name", () => {
    expect(due().map((d) => [d.bookingId, d.guestName, d.roomName, d.childAges])).toEqual([
      ['bk_a', 'Anna Beispiel', '102', [6]],
      ['bk_b', 'Bruno Beispiel', '101', []],
    ]);
  });

  it('leaves out guests the hotel wrote to about the stay in the last two weeks', () => {
    const recent = conversation({ id: 'inq_a', bookingId: 'bk_a' });
    const told = {
      ...recent,
      messages: [
        ...recent.messages,
        {
          ...recent.messages[0]!,
          id: 'msg_out',
          direction: 'out' as const,
          sentAt: '2026-05-01T09:00:00.000Z',
        },
      ],
    };
    expect(due([told]).map((d) => d.bookingId)).toEqual(['bk_b']);
    const longAgo = {
      ...told,
      messages: told.messages.map((m) => ({ ...m, sentAt: '2026-04-01T09:00:00.000Z' })),
    };
    expect(due([longAgo]).map((d) => d.bookingId)).toEqual(['bk_a', 'bk_b']);
  });
});

describe('arrival notes', () => {
  function setup() {
    const repos = createMemoryRepositories(
      { roomTypes: [double], rooms, guests, bookings },
      () => now,
    );
    let n = 0;
    const newId = (p: string) => `${p}_${++n}`;
    const clock = () => now;
    const hotel = createHotelService({
      repos,
      pricing: pricingConfig,
      policy: hotelPolicy,
      clock,
      newId,
    });
    return {
      repos,
      notes: createArrivalNoteService({ repos, clock }),
      inbox: createInboxService({ repos, hotel, clock, newId }),
    };
  }

  it("lists tomorrow's arrivals by default", async () => {
    const { notes } = setup();
    const { date, due } = await notes.due();
    expect(date).toBe('2026-05-11');
    expect(due).toHaveLength(2);
  });

  it('sends a note as an email linked to the booking, after which it is no longer due', async () => {
    const { notes, inbox, repos } = setup();
    const sent = await inbox.sendArrivalNote(
      'bk_a',
      { subject: ' Bis morgen ', body: 'Wir freuen uns auf Sie.' },
      'Jordan Lee',
      'user',
    );
    expect(sent).toMatchObject({
      subject: 'Bis morgen',
      senderAddress: 'anna@example.com',
      bookingId: 'bk_a',
      status: 'replied',
      unread: false,
    });
    expect(sent.messages[0]).toMatchObject({ direction: 'out', author: 'Jordan Lee' });
    expect((await notes.due()).due.map((d) => d.bookingId)).toEqual(['bk_b']);
    expect((await repos.audit.list({ subjectId: sent.id }))[0]).toMatchObject({
      action: 'inquiry.arrival_note',
      payload: { bookingId: 'bk_a' },
    });
  });

  it('refuses a note to a guest without an email, or for a booking that does not exist', async () => {
    const { inbox } = setup();
    const note = { subject: 'Hi', body: 'See you' };
    await expect(inbox.sendArrivalNote('bk_c', note, null, 'user')).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(inbox.sendArrivalNote('bk_nope', note, null, 'user')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
