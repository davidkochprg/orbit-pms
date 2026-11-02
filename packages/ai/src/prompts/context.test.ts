import { describe, expect, it } from 'vitest';
import { contextNote } from './context';

describe('contextNote', () => {
  it('names a booking with its token, guest, room, dates and status', () => {
    expect(
      contextNote({
        kind: 'booking',
        bookingId: 'bk_12',
        guestName: 'Demo Guest',
        roomName: '210',
        checkIn: '2026-10-26',
        checkOut: '2026-10-31',
        status: 'checked_in',
      }),
    ).toBe(
      'The staff member is looking at booking [[bk_12]]: Demo Guest, room 210, 2026-10-26 to 2026-10-31, checked in.',
    );
  });

  it('describes an inbox conversation by what the guest asks for, with a short message', () => {
    const note = contextNote({
      kind: 'inquiry',
      inquiryId: 'inq_4',
      senderName: 'Demo Sender',
      senderAddress: 'demo@example.com',
      request: {
        rooms: null,
        kind: 'booking_request',
        language: 'de',
        guestName: 'Demo Sender',
        checkIn: '2026-11-06',
        checkOut: '2026-11-08',
        adults: 2,
        childAges: [7],
        wishes: { wellness: false, dog: true, apartment: false },
        question: null,
      },
      lastMessage: 'x'.repeat(500),
    });
    expect(note).toContain('the inbox conversation [[inq_4]] with Demo Sender <demo@example.com>');
    expect(note).toContain(
      'They ask for 2026-11-06 to 2026-11-08, 2 adults, children aged 7, a dog.',
    );
    expect(note).toContain('They write in de.');
    expect(note).toMatch(/"x{400}…"$/);
  });

  it('copes with a conversation nothing was read from yet', () => {
    expect(
      contextNote({
        kind: 'inquiry',
        inquiryId: 'inq_9',
        senderName: null,
        senderAddress: null,
        request: null,
        lastMessage: null,
      }),
    ).toBe(
      'The staff member is looking at the inbox conversation [[inq_9]] with a guest, not yet a guest record.',
    );
  });

  it('describes a room by its state today and what is still to do in it', () => {
    expect(
      contextNote({
        kind: 'room',
        roomId: 'rm_104',
        roomTypeName: 'Double room',
        status: 'out_of_order',
        occupancy: 'arriving',
        guestName: 'Demo Guest',
        openTasks: ['Shower drips'],
      }),
    ).toBe(
      'The staff member is looking at room [[rm_104]], Double room: out of order, a guest arrives today (Demo Guest). Still to do: Shower drips.',
    );
  });

  it('describes a repair, a contact and a note', () => {
    expect(
      contextNote({
        kind: 'repair',
        taskId: 'hk_3',
        roomName: '201',
        issue: 'Lamp broken',
        trade: 'electrical',
        done: false,
        askedName: null,
      }),
    ).toBe(
      'The staff member is looking at the repair hk_3 in room 201: "Lamp broken" (electrical), nobody asked to fix it yet. Use taskId hk_3.',
    );
    expect(
      contextNote({
        kind: 'contact',
        contactId: 'ct_1',
        name: 'Demo Plumbing',
        trades: ['plumbing'],
        email: 'plumber@example.com',
        phone: null,
      }),
    ).toBe(
      'The staff member is looking at the contact ct_1: Demo Plumbing (plumbing), plumber@example.com.',
    );
    expect(
      contextNote({ kind: 'note', title: 'Sauna', folder: 'Wellness', until: '2026-11-08' }),
    ).toBe(
      'The staff member is looking at the note "Sauna" in Knowledge (Wellness), a notice until 2026-11-08.',
    );
  });

  it('describes a bill with where it stands and the repair it is for', () => {
    expect(
      contextNote({
        kind: 'bill',
        billId: 'sinv_1',
        supplierName: 'Test Plumbing',
        number: 'TP-7',
        total: '$385',
        status: 'unpaid',
        dueOn: '2026-11-12',
        repair: 'Bathroom tap is dripping · Room 203',
      }),
    ).toBe(
      'The staff member is looking at the bill sinv_1 from Test Plumbing (TP-7): $385, to pay by 2026-11-12, for the repair "Bathroom tap is dripping · Room 203". Use supplierInvoiceId sinv_1.',
    );
  });

  it('names a night and a range of nights', () => {
    expect(contextNote({ kind: 'night', date: '2026-11-06' })).toBe(
      'The staff member is looking at the night of 2026-11-06 on the rate outlook.',
    );
    expect(contextNote({ kind: 'tape_chart', from: '2026-11-02', to: '2026-11-15' })).toBe(
      'The staff member is looking at the tape chart for the nights 2026-11-02 to 2026-11-15.',
    );
  });
});
