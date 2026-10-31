import type { Guest } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { createGuestMemoryService, guestMemorySource } from './guest-memory';
import { booking, double, room } from './test-fixtures';
import { conversation, createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const guest: Guest = {
  id: 'gst_1',
  name: 'Anna Beispiel',
  email: 'Anna@Example.com',
  phone: null,
  language: 'de',
  notes: null,
};
const rooms = [room('rm_1', { name: '101' })];
const earlier = booking({
  id: 'bk_old',
  guestId: 'gst_1',
  roomId: 'rm_1',
  checkIn: '2026-03-01',
  checkOut: '2026-03-04',
  status: 'checked_out',
  notes: 'Feather allergy.',
});
const upcoming = booking({
  id: 'bk_now',
  guestId: 'gst_1',
  roomId: 'rm_1',
  checkIn: '2026-05-10',
  checkOut: '2026-05-12',
  notes: 'Cot, please.',
});

describe('guestMemorySource', () => {
  const source = (overrides: Partial<Parameters<typeof guestMemorySource>[0]> = {}) =>
    guestMemorySource({
      guest,
      bookings: [earlier, upcoming],
      inquiries: [],
      rooms,
      roomTypes: [double],
      today: '2026-05-10',
      ...overrides,
    });

  it('lists the profile notes, earlier stays and their notes, but not the stay at hand', () => {
    const text = source()!;
    expect(text).toContain('Earlier stays (1):');
    expect(text).toContain(
      '- 2026-03-01 to 2026-03-04, Double 101, 2 adults. Notes: Feather allergy.',
    );
    expect(text).not.toContain('Cot');
  });

  it("adds the guest's own messages, found by email or booking, newest first", () => {
    const byEmail = conversation({
      id: 'inq_1',
      senderAddress: 'anna@example.com',
      body: 'We love the sauna.',
    });
    const other = conversation({
      id: 'inq_2',
      senderAddress: 'someone@example.com',
      body: 'Hello',
    });
    const text = source({ inquiries: [byEmail, other] })!;
    expect(text).toContain('"We love the sauna."');
    expect(text).not.toContain('Hello');
  });

  it('has nothing to read for a guest without notes, noted stays or messages', () => {
    expect(source({ bookings: [{ ...earlier, notes: null }, upcoming] })).toBeNull();
  });
});

describe('guest memory service', () => {
  function setup() {
    const repos = createMemoryRepositories(
      { roomTypes: [double], rooms, guests: [guest], bookings: [earlier, upcoming] },
      () => now,
    );
    return { repos, memories: createGuestMemoryService({ repos, clock: () => now }) };
  }

  it('asks for a reading until one is saved for the current history', async () => {
    const { memories, repos } = setup();
    expect(await memories.get('gst_1')).toMatchObject({ current: false, items: [], pastStays: 1 });
    const source = await memories.sourceToRead('gst_1');
    expect(source).toContain('Feather allergy');
    const items = [{ kind: 'care' as const, text: 'Allergic to feathers.' }];
    expect(await memories.save('gst_1', source!, items)).toMatchObject({ current: true, items });
    expect(await memories.sourceToRead('gst_1')).toBeNull();

    // A new note changes the history: the old reading still shows until it is read again.
    repos.state.guests[0] = { ...guest, notes: 'Prefers the ground floor.' };
    expect(await memories.get('gst_1')).toMatchObject({ current: false, items });
  });

  it('refuses an unknown guest', async () => {
    await expect(setup().memories.get('gst_nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
