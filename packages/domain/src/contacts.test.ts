import { type Contact, contactProposalSchema, type HousekeepingTask } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { buildDailyBrief } from './brief';
import {
  contactFromProposal,
  contactsForTrade,
  createContactService,
  repairEmails,
  roomAccess,
} from './contacts';
import { createInboxService } from './inbox-service';
import { guestBookRulesFor, hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createHotelService } from './service';
import { booking, plumber, room } from './test-fixtures';
import { conversation, createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const today = '2026-05-10';
const guests = [
  { id: 'gst_a', name: 'Anna Example' },
  { id: 'gst_b', name: 'Ben Sample' },
];

const contact = (id: string, overrides: Partial<Contact> = {}): Contact => ({
  ...plumber,
  id,
  name: id,
  ...overrides,
});

const task = (overrides: Partial<HousekeepingTask> = {}): HousekeepingTask => ({
  id: 'hk_tap',
  roomId: 'rm_1',
  type: 'maintenance',
  status: 'open',
  notes: 'Tap is dripping.',
  trade: 'plumbing',
  contactId: null,
  createdAt: '2026-05-10T07:00:00.000Z',
  ...overrides,
});

describe('contactsForTrade', () => {
  const contacts = [
    contact('Beta Plumbing'),
    contact('Alpha Plumbing'),
    contact('Spark Electric', { trades: ['electrical'] }),
    contact('Handy Co', { trades: ['building', 'plumbing'] }),
  ];

  it('lists the contacts for the trade by name', () => {
    expect(contactsForTrade('plumbing', contacts, []).map((c) => c.id)).toEqual([
      'Alpha Plumbing',
      'Beta Plumbing',
      'Handy Co',
    ]);
  });

  it('puts the contact last asked about that trade first', () => {
    const tasks = [
      task({ id: 'hk_1', contactId: 'Handy Co', createdAt: '2026-05-01T00:00:00.000Z' }),
      task({ id: 'hk_2', contactId: 'Beta Plumbing', createdAt: '2026-05-05T00:00:00.000Z' }),
      // Asked for another trade: does not count for plumbing.
      task({ id: 'hk_3', contactId: 'Alpha Plumbing', trade: 'building' }),
    ];
    expect(contactsForTrade('plumbing', contacts, tasks).map((c) => c.id)).toEqual([
      'Beta Plumbing',
      'Handy Co',
      'Alpha Plumbing',
    ]);
  });

  it('suggests nobody without a trade', () => {
    expect(contactsForTrade(null, contacts, [])).toEqual([]);
  });
});

describe('roomAccess', () => {
  const access = (bookings: Parameters<typeof roomAccess>[1]) =>
    roomAccess('rm_1', bookings, guests, today, now);

  it('is free from today when nobody is in the room, until the next arrival', () => {
    expect(
      access([booking({ roomId: 'rm_1', checkIn: '2026-05-14', checkOut: '2026-05-16' })]),
    ).toEqual({ guestName: null, freeFrom: today, freeUntil: '2026-05-14' });
  });

  it('waits for the guest in the room to leave, treating back-to-back stays as one', () => {
    expect(
      access([
        booking({
          roomId: 'rm_1',
          guestId: 'gst_a',
          checkIn: '2026-05-08',
          checkOut: '2026-05-11',
        }),
        booking({
          roomId: 'rm_1',
          guestId: 'gst_b',
          checkIn: '2026-05-11',
          checkOut: '2026-05-13',
        }),
        booking({ roomId: 'rm_1', checkIn: '2026-05-15', checkOut: '2026-05-17' }),
      ]),
    ).toEqual({ guestName: 'Anna Example', freeFrom: '2026-05-13', freeUntil: '2026-05-15' });
  });

  it('counts a guest leaving today as gone and an arrival today as the limit', () => {
    expect(
      access([
        booking({ roomId: 'rm_1', checkIn: '2026-05-08', checkOut: today }),
        booking({ roomId: 'rm_1', guestId: 'gst_b', checkIn: today, checkOut: '2026-05-12' }),
      ]),
    ).toEqual({ guestName: 'Ben Sample', freeFrom: '2026-05-12', freeUntil: null });
    expect(access([booking({ roomId: 'rm_1', checkIn: today, checkOut: '2026-05-12' })])).toEqual(
      expect.objectContaining({ freeFrom: '2026-05-12' }),
    );
  });

  it('ignores other rooms, cancellations and lapsed holds', () => {
    expect(
      access([
        booking({ roomId: 'rm_2', checkIn: '2026-05-09', checkOut: '2026-05-12' }),
        booking({ roomId: 'rm_1', status: 'cancelled', checkIn: '2026-05-09' }),
        booking({
          roomId: 'rm_1',
          status: 'hold',
          holdExpiresAt: '2026-05-09T00:00:00.000Z',
          checkIn: '2026-05-11',
        }),
      ]),
    ).toEqual({ guestName: null, freeFrom: today, freeUntil: null });
  });
});

describe('contactFromProposal', () => {
  it('starts a new contact in the hotel language with empty optional fields', () => {
    expect(
      contactFromProposal(
        null,
        { contactId: null, name: ' Spark Electric ', trades: ['electrical'] },
        'cs',
      ),
    ).toEqual({
      name: 'Spark Electric',
      person: null,
      trades: ['electrical'],
      phone: null,
      email: null,
      language: 'cs',
      notes: null,
    });
  });

  it('keeps what a change leaves out and clears what it sends as empty', () => {
    expect(
      contactFromProposal(
        plumber,
        { contactId: plumber.id, phone: '', notes: 'Weekends too' },
        'cs',
      ),
    ).toMatchObject({ phone: null, email: plumber.email, notes: 'Weekends too', language: 'en' });
  });

  it('reads a new contact whose ID a model wrote as "null"', () => {
    const proposal = contactProposalSchema.parse({
      contactId: 'null',
      name: 'X',
      trades: ['locks'],
    });
    expect(proposal.contactId).toBeNull();
  });

  it('rejects a contact that does nothing or has a broken email', () => {
    expect(() =>
      contactFromProposal(null, { contactId: null, name: 'X', trades: [] }, 'en'),
    ).toThrow('trades');
    expect(() =>
      contactFromProposal(plumber, { contactId: plumber.id, email: 'nope' }, 'en'),
    ).toThrow('email');
  });
});

describe('repairEmails', () => {
  it("lists a repair's conversations, latest first, and whether the contractor answered", () => {
    const out = (id: string, lastMessageAt: string, overrides = {}) => ({
      ...conversation({ id, taskId: 'hk_tap', lastMessageAt, senderName: 'Test Plumbing' }),
      ...overrides,
    });
    const asked = out('inq_1', '2026-05-09T08:00:00.000Z');
    const answered = conversation({
      id: 'inq_2',
      taskId: 'hk_tap',
      lastMessageAt: '2026-05-10T08:00:00.000Z',
      senderName: 'Test Plumbing',
      unread: true,
    });
    const sentOnly = {
      ...asked,
      unread: false,
      messages: asked.messages.map((m) => ({ ...m, direction: 'out' as const })),
    };
    expect(
      repairEmails('hk_tap', [
        sentOnly,
        answered,
        out('inq_3', '2026-05-10T09:00:00.000Z', { trashedAt: '2026-05-10T09:30:00.000Z' }),
        conversation({ id: 'inq_4', taskId: 'hk_other' }),
        conversation({ id: 'inq_5' }),
      ]),
    ).toEqual([
      {
        inquiryId: 'inq_2',
        subject: null,
        name: 'Test Plumbing',
        lastMessageAt: '2026-05-10T08:00:00.000Z',
        answered: true,
        unread: true,
      },
      {
        inquiryId: 'inq_1',
        subject: null,
        name: 'Test Plumbing',
        lastMessageAt: '2026-05-09T08:00:00.000Z',
        answered: false,
        unread: false,
      },
    ]);
  });
});

describe('contact service', () => {
  function setup(tasks: HousekeepingTask[] = [task()]) {
    const repos = createMemoryRepositories(
      {
        rooms: [room('rm_1', { name: '101' })],
        guests: guests.map((g) => ({
          ...g,
          email: null,
          phone: null,
          language: 'en',
          notes: null,
        })),
        bookings: [
          booking({
            roomId: 'rm_1',
            guestId: 'gst_a',
            checkIn: '2026-05-09',
            checkOut: '2026-05-12',
          }),
        ],
        contacts: [plumber],
        tasks,
      },
      () => now,
    );
    let n = 0;
    const clock = () => now;
    const newId = (p: string) => `${p}_${++n}`;
    const contacts = createContactService({ repos, clock, newId });
    const hotel = createHotelService({
      repos,
      pricing: pricingConfig,
      policy: hotelPolicy,
      clock,
      newId,
    });
    const inbox = createInboxService({ repos, hotel, clock, newId });
    return { repos, contacts, inbox };
  }

  const email = { contactId: plumber.id, subject: 'Room 101: tap', body: 'Could you come?' };

  it('creates, updates and removes contacts, each in the audit log', async () => {
    const { repos, contacts } = setup();
    const body = {
      name: 'Spark Electric',
      person: null,
      trades: ['electrical' as const],
      phone: null,
      email: null,
      language: 'en' as const,
      notes: null,
    };
    const created = await contacts.create(body, 'user');
    expect(created.id).toBe('ct_1');
    await contacts.update(created.id, { ...body, phone: '555 0123' }, 'user');
    expect(await contacts.get(created.id)).toMatchObject({ phone: '555 0123' });
    await contacts.remove(created.id, 'user');
    expect(await contacts.list()).toEqual([plumber]);
    expect(repos.state.audit.map((e) => e.action)).toEqual([
      'contact.create',
      'contact.update',
      'contact.remove',
    ]);
  });

  it('shows a repair with who can fix it and when the room is free', async () => {
    const { contacts } = setup();
    expect(await contacts.repair('hk_tap')).toEqual({
      task: task(),
      roomName: '101',
      access: { guestName: 'Anna Example', freeFrom: '2026-05-12', freeUntil: null },
      contacts: [plumber],
      contact: null,
      emails: [],
    });
  });

  it('records who was asked to fix a repair and starts it', async () => {
    const { repos, contacts } = setup([task({ trade: null })]);
    const updated = await contacts.askToRepair('hk_tap', plumber.id, 'user');
    expect(updated).toMatchObject({
      contactId: plumber.id,
      status: 'in_progress',
      // A repair without a trade takes the contact's.
      trade: 'plumbing',
    });
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'task.contact',
      subjectId: 'rm_1',
      payload: { taskId: 'hk_tap', contactName: 'Test Plumbing' },
    });
    expect((await contacts.repair('hk_tap')).contact).toEqual(plumber);
  });

  it('emails a contractor from the mailbox, linked to the repair, and counts them as asked', async () => {
    const { repos, contacts, inbox } = setup();
    const sent = await inbox.sendWorkOrder('hk_tap', email, 'Front Desk', 'user');
    expect(sent).toMatchObject({
      taskId: 'hk_tap',
      bookingId: null,
      subject: 'Room 101: tap',
      senderName: 'Test Plumbing',
      senderAddress: 'plumbing@example.com',
      status: 'replied',
      unread: false,
      messages: [{ direction: 'out', body: 'Could you come?', author: 'Front Desk' }],
    });
    const repair = await contacts.repair('hk_tap');
    expect(repair.task).toMatchObject({ contactId: plumber.id, status: 'in_progress' });
    expect(repair.emails).toMatchObject([{ inquiryId: sent.id, answered: false }]);
    expect(repos.state.audit.map((e) => e.action)).toEqual(['task.contact', 'inquiry.work_order']);

    // The contractor's answer shows on the repair and on the day's brief.
    await inbox.receive(sent.id, 'Tomorrow at 9 works.');
    expect((await contacts.repair('hk_tap')).emails[0]).toMatchObject({ answered: true });
    const brief = buildDailyBrief({
      date: '2026-05-10',
      now,
      rooms: await repos.rooms.listRooms(),
      guests: [],
      bookings: [],
      tasks: await repos.housekeeping.listTasks(),
      inquiries: await repos.inquiries.listInquiries(),
      stayGuests: [],
      rules: guestBookRulesFor('CZ'),
    });
    expect(brief.maintenance).toEqual([
      {
        taskId: 'hk_tap',
        roomId: 'rm_1',
        roomName: '101',
        notes: 'Tap is dripping.',
        asked: true,
        answeredBy: 'Test Plumbing',
      },
    ]);
  });

  it('sends nothing, and asks nobody, when the contractor has no email', async () => {
    const { repos, contacts, inbox } = setup();
    await contacts.update(plumber.id, { ...plumber, email: null }, 'user');
    await expect(inbox.sendWorkOrder('hk_tap', email, null, 'user')).rejects.toThrow(
      'has no email address',
    );
    expect((await contacts.repair('hk_tap')).task.status).toBe('open');
    expect(await repos.inquiries.listInquiries()).toEqual([]);
    await expect(
      inbox.sendWorkOrder('hk_tap', { ...email, contactId: 'ct_x' }, null, 'user'),
    ).rejects.toThrow('not found');
  });

  it('only repairs that are not done have someone to fix them', async () => {
    const { contacts } = setup([
      task({ id: 'hk_clean', type: 'turnover', trade: null }),
      task({ id: 'hk_done', status: 'done' }),
    ]);
    await expect(contacts.repair('hk_clean')).rejects.toThrow('Only a repair task');
    await expect(contacts.askToRepair('hk_done', plumber.id, 'user')).rejects.toThrow(
      'already done',
    );
    await expect(contacts.askToRepair('hk_x', plumber.id, 'user')).rejects.toThrow('not found');
  });
});
