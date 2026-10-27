import type { InquiryExtraction } from '@orbit/shared';
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
      rawText: ' Hallo ',
      channel: 'ota',
      partner: 'Booking.com',
      senderName: 'Familie Beispiel',
      senderAddress,
    });
    const { options, note } = await ctx.hotel.inboxOptions(analysis);
    const saved = await ctx.inbox.saveProcessing(msg.id, {
      ok: true,
      parsed: analysis,
      suggestion: { options, note, draft: 'Guten Tag…', draftLanguage: 'de' },
    });
    return { ...ctx, msg, saved };
  }

  it('creates a message and marks it quoted once rooms are prepared', async () => {
    const { msg, saved } = await processed();
    expect(msg).toMatchObject({ rawText: 'Hallo', status: 'new', partner: 'Booking.com' });
    expect(saved).toMatchObject({
      status: 'quoted',
      processedAt: now.toISOString(),
      processingError: null,
    });
  });

  it('records a processing error without losing the message', async () => {
    const { inbox } = setup();
    const msg = await inbox.create({ rawText: 'x', channel: 'email' });
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
    await expect(inbox.createHold(msg.id, 'rm_a1', 'user')).rejects.toMatchObject({
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
    const question = await other.create({ rawText: 'Parking?', channel: 'email' });
    await expect(other.createHold(question.id, 'rm_2', 'user')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('marks a reply as sent and audits it', async () => {
    const { repos, inbox, msg } = await processed();
    const replied = await inbox.markReplied(msg.id, '  Guten Tag, gerne!  ', 'user');
    expect(replied).toMatchObject({ status: 'replied', reply: 'Guten Tag, gerne!' });
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'inquiry.replied',
      subjectId: msg.id,
      actor: 'user',
    });
    await expect(inbox.markReplied(msg.id, ' ', 'user')).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });
});
