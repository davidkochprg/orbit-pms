import type { ComposeBody, InquiryExtraction } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { createInboxService } from './inbox-service';
import { hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createHotelService } from './service';
import { apartment, booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const analysis: InquiryExtraction = {
  kind: 'booking_request',
  language: 'de',
  guestName: 'Familie Beispiel',
  checkIn: '2026-05-20',
  checkOut: '2026-05-22',
  adults: 2,
  childAges: [4],
  wishes: { wellness: true, dog: false, apartment: false },
  question: null,
};

function setup() {
  const repos = createMemoryRepositories(
    {
      roomTypes: [double, apartment],
      rooms: [
        room('rm_1', { name: '1' }),
        room('rm_2', { name: '2' }),
        room('rm_a1', { name: 'A1', kind: 'apartment', roomTypeId: apartment.id }),
      ],
      guests: [
        {
          id: 'gst_1',
          name: 'Known Guest',
          email: 'Known@Example.com',
          phone: null,
          language: 'de',
          notes: null,
        },
      ],
      bookings: [
        booking({ id: 'bk_x', roomId: 'rm_1', checkIn: '2026-05-19', checkOut: '2026-05-21' }),
      ],
    },
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
  const inbox = createInboxService({ repos, hotel, clock, newId });
  return { repos, hotel, inbox };
}

describe('hotel.inboxOptions', () => {
  it('offers one free room per type with an exact quote, including wished add-ons', async () => {
    const { hotel } = setup();
    const { options, note } = await hotel.inboxOptions(analysis);
    expect(note).toBeNull();
    expect(options.map((o) => o.roomName)).toEqual(['2', 'A1']);
    expect(options[0]?.quote.lines.some((l) => l.kind === 'wellness')).toBe(true);
  });

  it('sends a dog to an apartment and explains when nothing is free', async () => {
    const { hotel } = setup();
    const withDog = await hotel.inboxOptions({
      ...analysis,
      wishes: { ...analysis.wishes, dog: true },
    });
    expect(withDog.options.map((o) => o.roomName)).toEqual(['A1']);
    const tooBig = await hotel.inboxOptions({ ...analysis, adults: 9 });
    expect(tooBig.options).toEqual([]);
    expect(tooBig.note).toMatch(/No room is free/);
  });

  it('offers nothing for a question', async () => {
    const { hotel } = setup();
    expect(await hotel.inboxOptions({ ...analysis, kind: 'question' })).toEqual({
      options: [],
      note: null,
    });
  });
});

describe('inbox service', () => {
  async function processed(senderAddress: string | null = 'new.guest@example.com') {
    const ctx = setup();
    const msg = await ctx.inbox.create({
      body: ' Hallo ',
      channel: 'ota',
      partner: 'Booking.com',
      senderName: 'Familie Beispiel',
      senderAddress,
    });
    const { options, note } = await ctx.hotel.inboxOptions(analysis);
    const saved = await ctx.inbox.saveProcessing(msg.id, {
      ok: true,
      parsed: analysis,
      suggestion: {
        options,
        note,
        draft: 'Guten Tag…',
        draftLanguage: 'de',
        draftTranslation: { language: 'cs', text: 'Dobrý den…' },
      },
    });
    return { ...ctx, msg, saved };
  }

  it('creates a message and marks it quoted once rooms are prepared', async () => {
    const { msg, saved } = await processed();
    expect(msg).toMatchObject({ status: 'new', partner: 'Booking.com', unread: true });
    expect(msg.messages).toEqual([
      expect.objectContaining({ direction: 'in', body: 'Hallo', author: null }),
    ]);
    expect(saved).toMatchObject({
      status: 'quoted',
      processedAt: now.toISOString(),
      processingError: null,
    });
  });

  it('looks for rooms again for a request read when nothing was free', async () => {
    const { inbox, msg, repos } = await processed();
    await inbox.saveProcessing(msg.id, {
      ok: true,
      parsed: analysis,
      suggestion: {
        options: [],
        note: 'Nothing free',
        draft: 'Sorry…',
        draftLanguage: 'de',
        draftTranslation: null,
      },
    });
    await repos.inquiries.updateInquiry({ ...(await inbox.get(msg.id)), status: 'new' });
    const refreshed = await inbox.refreshOptions(msg.id);
    expect(refreshed.status).toBe('quoted');
    expect(refreshed.suggestion).toMatchObject({ note: null, draft: null });
    expect(refreshed.suggestion?.options.length).toBeGreaterThan(0);
  });

  it('refuses to look for rooms before the request is read', async () => {
    const { inbox } = setup();
    const msg = await inbox.create({ body: 'x', channel: 'email' });
    await expect(inbox.refreshOptions(msg.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('records a processing error without losing the message', async () => {
    const { inbox } = setup();
    const msg = await inbox.create({ body: 'x', channel: 'email' });
    const saved = await inbox.saveProcessing(msg.id, { ok: false, error: 'AI budget reached' });
    expect(saved).toMatchObject({ status: 'new', processingError: 'AI budget reached' });
  });

  it('turns a booking request into a hold for a new guest, linked both ways', async () => {
    const { repos, inbox, msg } = await processed();
    const hold = await inbox.createHold(msg.id, 'rm_2', 'user');
    expect(hold).toMatchObject({
      status: 'hold',
      roomId: 'rm_2',
      source: 'ota',
      checkIn: '2026-05-20',
    });
    expect(hold.addons.wellness).toBe(true);
    expect(repos.state.guests.find((g) => g.id === hold.guestId)).toMatchObject({
      name: 'Familie Beispiel',
      language: 'de',
    });
    expect((await inbox.get(msg.id)).bookingId).toBe(hold.id);
  });

  it('moves the hold when staff hold another room, quoted in that room', async () => {
    const { hotel, inbox, msg } = await processed();
    const first = await inbox.createHold(msg.id, 'rm_2', 'user');
    const switched = await inbox.createHold(msg.id, 'rm_a1', 'user');
    expect(switched).toMatchObject({ id: first.id, roomId: 'rm_a1', status: 'hold' });
    expect(switched.priceSnapshot?.total).not.toBe(first.priceSnapshot?.total);
    expect((await inbox.get(msg.id)).bookingId).toBe(first.id);
    await expect(inbox.createHold(msg.id, 'rm_a1', 'user')).rejects.toMatchObject({
      code: 'conflict',
    });
    // Once confirmed, it is a booking, not a hold to move around.
    await hotel.applyBookingAction(first.id, 'confirm', 'user');
    await expect(inbox.createHold(msg.id, 'rm_2', 'user')).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('reuses a known guest by email, ignoring case', async () => {
    const { inbox, msg } = await processed('known@example.com');
    expect((await inbox.createHold(msg.id, 'rm_2', 'user')).guestId).toBe('gst_1');
  });

  it('rejects a hold for a message without a stay request, or in a taken room', async () => {
    const { inbox, msg } = await processed();
    await expect(inbox.createHold(msg.id, 'rm_1', 'user')).rejects.toMatchObject({
      code: 'conflict',
    });
    const { inbox: other } = setup();
    const question = await other.create({ body: 'Parking?', channel: 'email' });
    await expect(other.createHold(question.id, 'rm_2', 'user')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('sends a reply, which uses up the draft but keeps the rooms on offer', async () => {
    const { repos, inbox, msg } = await processed();
    const sent = await inbox.send(msg.id, { body: '  Guten Tag, gerne!  ' }, 'Martina', 'user');
    expect(sent).toMatchObject({ status: 'replied', unread: false });
    expect(sent.messages.at(-1)).toMatchObject({
      direction: 'out',
      body: 'Guten Tag, gerne!',
      author: 'Martina',
    });
    expect(sent.lastMessageAt).toBe(now.toISOString());
    expect(sent.suggestion).toMatchObject({ draft: null, draftTranslation: null });
    expect(sent.suggestion?.options.length).toBeGreaterThan(0);
    expect(await inbox.get(msg.id)).toEqual(sent);
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'inquiry.replied',
      subjectId: msg.id,
      actor: 'user',
    });
    await expect(inbox.send(msg.id, { body: ' ' }, null, 'user')).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('brings a conversation back when the guest writes again', async () => {
    const { inbox, msg } = await processed();
    await inbox.send(msg.id, { body: 'Guten Tag' }, null, 'user');
    await inbox.setArchived(msg.id, true);
    const again = await inbox.receive(msg.id, 'Danke! Und ein Parkplatz?');
    expect(again).toMatchObject({
      status: 'new',
      unread: true,
      archivedAt: null,
      suggestion: null,
      processedAt: null,
    });
    expect(again.messages.map((m) => m.direction)).toEqual(['in', 'out', 'in']);
    // The stay it asked for is still known, for holding a room.
    expect(again.parsed).toEqual(analysis);
  });

  it('keeps a settled conversation settled when the guest writes again', async () => {
    const { inbox, msg } = await processed();
    await inbox.decline(msg.id, 'user');
    expect((await inbox.receive(msg.id, 'Schade.')).status).toBe('declined');
  });

  it('composes a new email to a guest', async () => {
    const { repos, inbox } = setup();
    const sent = await inbox.compose(
      {
        to: [{ name: 'Demo Guest', address: 'demo@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Your stay',
        body: 'Hello',
        attachmentIds: [],
        forwardOf: null,
        draftId: null,
      },
      'Martina',
      'user',
    );
    expect(sent).toMatchObject({
      channel: 'email',
      senderAddress: 'demo@example.com',
      status: 'replied',
      unread: false,
    });
    expect(sent.messages).toEqual([expect.objectContaining({ direction: 'out', body: 'Hello' })]);
    expect(repos.state.audit.at(-1)).toMatchObject({ action: 'inquiry.compose' });
  });

  it('marks conversations read or unread and archives them', async () => {
    const { inbox, msg } = await processed();
    expect((await inbox.setUnread(msg.id, false)).unread).toBe(false);
    expect((await inbox.setUnread(msg.id, true)).unread).toBe(true);
    expect((await inbox.setArchived(msg.id, true)).archivedAt).toBe(now.toISOString());
    expect((await inbox.setArchived(msg.id, false)).archivedAt).toBe(null);
  });

  it('keeps a translation with its message', async () => {
    const { inbox, msg } = await processed();
    const messageId = msg.messages[0]!.id;
    await inbox.saveTranslation(msg.id, messageId, { language: 'cs', text: 'Dobrý den' });
    expect((await inbox.get(msg.id)).messages[0]?.translation).toEqual({
      language: 'cs',
      text: 'Dobrý den',
    });
    await expect(
      inbox.saveTranslation(msg.id, 'msg_nope', { language: 'cs', text: '' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('declines a message unless it already led to a booking', async () => {
    const { inbox, repos, msg } = await processed();
    const declined = await inbox.decline(msg.id, 'user');
    expect(declined.status).toBe('declined');
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'inquiry.decline',
      payload: { from: 'quoted' },
    });

    const other = await processed();
    await other.inbox.createHold(other.msg.id, 'rm_2', 'user');
    await expect(other.inbox.decline(other.msg.id, 'user')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  const file = { id: 'att_1', name: 'menu.pdf', contentType: 'application/pdf', size: 3 };
  const compose = (overrides: Partial<ComposeBody> = {}): ComposeBody => ({
    to: [{ name: 'Demo Guest', address: 'demo@example.com' }],
    cc: [],
    bcc: [],
    subject: 'Your stay',
    body: 'Hello',
    attachmentIds: [],
    forwardOf: null,
    draftId: null,
    ...overrides,
  });

  it('sends to several people with copies and files, and drops the draft it came from', async () => {
    const { repos, inbox } = setup();
    await repos.mail.saveAttachment(file, new Uint8Array([1, 2, 3]));
    repos.state.drafts.push({
      id: 'drf_1',
      inquiryId: null,
      forwardOf: null,
      to: [],
      cc: [],
      bcc: [],
      subject: '',
      body: '',
      attachments: [],
      updatedAt: now.toISOString(),
    });
    const sent = await inbox.compose(
      compose({
        to: [
          { name: null, address: 'a@example.com' },
          { name: null, address: 'b@example.com' },
        ],
        cc: [{ name: 'Boss', address: 'boss@example.com' }],
        attachmentIds: ['att_1'],
        draftId: 'drf_1',
      }),
      'Martina',
      'user',
    );
    expect(sent.senderAddress).toBe('a@example.com');
    expect(sent.messages[0]).toMatchObject({
      to: [{ address: 'a@example.com' }, { address: 'b@example.com' }],
      cc: [{ address: 'boss@example.com' }],
      attachments: [file],
    });
    expect(repos.state.drafts).toEqual([]);
    await expect(
      inbox.compose(compose({ attachmentIds: ['att_x'] }), null, 'user'),
    ).rejects.toThrow('no longer there');
  });

  it('forwards a conversation as a new one, refusing an unknown original', async () => {
    const { repos, inbox, msg } = await processed();
    const fwd = await inbox.compose(
      compose({ subject: 'Fwd: Anfrage', forwardOf: msg.id }),
      'Martina',
      'user',
    );
    expect(fwd.id).not.toBe(msg.id);
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'inquiry.compose',
      payload: { forwardOf: msg.id },
    });
    await expect(inbox.compose(compose({ forwardOf: 'inq_x' }), null, 'user')).rejects.toThrow(
      'not found',
    );
  });

  it('copies a reply only by email', async () => {
    const { repos, inbox } = setup();
    const email = await inbox.create({ body: 'Hi', channel: 'email' });
    const reply = await inbox.send(
      email.id,
      { body: 'Gerne', cc: [{ name: null, address: 'partner@example.com' }] },
      null,
      'user',
    );
    expect(reply.messages.at(-1)?.cc).toEqual([{ name: null, address: 'partner@example.com' }]);
    const ota = await inbox.create({ body: 'Hi', channel: 'ota', partner: 'Booking.com' });
    await expect(
      inbox.send(
        ota.id,
        { body: 'Hi', cc: [{ name: null, address: 'x@example.com' }] },
        null,
        'user',
      ),
    ).rejects.toThrow('Only an email');
    expect(repos.state.inquiries).toHaveLength(2);
  });

  it('stars, trashes, restores and deletes for good only from the trash', async () => {
    const { repos, inbox, msg } = await processed();
    expect((await inbox.setStarred(msg.id, true)).starred).toBe(true);
    await expect(inbox.deleteForever(msg.id, 'user')).rejects.toThrow('trash first');
    expect((await inbox.setTrashed(msg.id, true, 'user')).trashedAt).toBe(now.toISOString());
    // The guest writing again brings it back.
    expect((await inbox.receive(msg.id, 'Hallo?')).trashedAt).toBeNull();
    await inbox.setTrashed(msg.id, true, 'user');
    repos.state.drafts.push({
      id: 'drf_r',
      inquiryId: msg.id,
      forwardOf: null,
      to: [],
      cc: [],
      bcc: [],
      subject: '',
      body: 'Draft',
      attachments: [],
      updatedAt: now.toISOString(),
    });
    await inbox.deleteForever(msg.id, 'user');
    expect(repos.state.inquiries).toEqual([]);
    expect(repos.state.drafts).toEqual([]);
    expect(repos.state.audit.map((a) => a.action).slice(-2)).toEqual([
      'inquiry.trash',
      'inquiry.delete',
    ]);
  });

  it('labels conversations with labels that exist', async () => {
    const { repos, inbox, msg } = await processed();
    repos.state.labels.push({ id: 'lbl_1', name: 'Groups', color: 'blue' });
    expect((await inbox.setLabels(msg.id, ['lbl_1', 'lbl_1'])).labelIds).toEqual(['lbl_1']);
    await expect(inbox.setLabels(msg.id, ['lbl_x'])).rejects.toThrow('not found');
  });

  it('changes many conversations at once, all or none', async () => {
    const { repos, inbox, msg } = await processed();
    const other = await inbox.create({ body: 'Second', channel: 'email' });
    repos.state.labels.push({ id: 'lbl_1', name: 'Groups', color: 'blue' });
    const ids = [msg.id, other.id];
    await inbox.bulk({ ids, action: 'star', labelId: null }, 'user');
    await inbox.bulk({ ids, action: 'label', labelId: 'lbl_1' }, 'user');
    await inbox.bulk({ ids, action: 'archive', labelId: null }, 'user');
    await inbox.bulk({ ids, action: 'read', labelId: null }, 'user');
    for (const m of await inbox.list()) {
      expect(m).toMatchObject({ starred: true, labelIds: ['lbl_1'], unread: false });
      expect(m.archivedAt).not.toBeNull();
    }
    await inbox.bulk({ ids, action: 'trash', labelId: null }, 'user');
    expect(repos.state.audit.at(-1)).toMatchObject({ action: 'inquiry.trash', payload: { ids } });
    await expect(
      inbox.bulk({ ids: [msg.id, 'inq_x'], action: 'restore', labelId: null }, 'user'),
    ).rejects.toThrow('not found');
    expect((await inbox.get(msg.id)).trashedAt).not.toBeNull();
  });
});
