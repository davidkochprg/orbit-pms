import { describe, expect, it } from 'vitest';
import { collectEntities, entityKind, parseAnswer, parseInline } from './agent-answer';

describe('entityKind', () => {
  it('reads the kind from the ID prefix', () => {
    expect(entityKind('bk_147')).toBe('booking');
    expect(entityKind('rm_a1')).toBe('room');
    expect(entityKind('gst_12')).toBe('guest');
    expect(entityKind('inq_seed_ota')).toBe('conversation');
    expect(entityKind('chg_1')).toBe(null);
  });
});

describe('conversations', () => {
  it('names a conversation from the inbox tools, and picks out its mention', () => {
    const map = collectEntities([
      [{ inquiryId: 'inq_4', senderName: 'Ruth Example', status: 'quoted' }],
    ]);
    expect(map.get('inq_4')).toEqual({ kind: 'conversation', id: 'inq_4', name: 'Ruth Example' });
    expect(parseInline('Answered [[inq_4]].')).toContainEqual({ type: 'mention', id: 'inq_4' });
  });
});

describe('collectEntities', () => {
  it('finds bookings, rooms and guests in the shapes the tools return', () => {
    const entities = collectEntities([
      // getArrivals / searchBookings
      [
        {
          bookingId: 'bk_1',
          guestId: 'gst_1',
          guestName: 'Tomáš Novák',
          roomName: '104',
          roomId: 'rm_104',
          checkIn: '2026-10-28',
          checkOut: '2026-10-30',
          status: 'confirmed',
          adults: 2,
          childAges: [5],
        },
      ],
      // getDailyBrief: a summary nested in an item
      {
        holds: [
          {
            summary: {
              booking: { id: 'bk_2', checkIn: '2026-10-29', status: 'hold' },
              guestName: 'Demo Guest',
              roomName: '201',
            },
          },
        ],
      },
      // getBooking
      {
        booking: { id: 'bk_3', checkIn: '2026-11-01' },
        guest: { id: 'gst_3', name: 'Anna Example' },
        room: { id: 'rm_301', name: '301' },
      },
      // listRooms
      [{ id: 'rm_a1', name: 'A1', status: 'clean' }],
    ]);
    expect(entities.get('bk_1')).toMatchObject({
      kind: 'booking',
      guestName: 'Tomáš Novák',
      roomName: '104',
      checkOut: '2026-10-30',
      childAges: [5],
    });
    expect(entities.get('bk_2')).toMatchObject({ guestName: 'Demo Guest', status: 'hold' });
    expect(entities.get('bk_3')).toMatchObject({ guestName: 'Anna Example', roomName: '301' });
    expect(entities.get('gst_1')).toEqual({ kind: 'guest', id: 'gst_1', name: 'Tomáš Novák' });
    expect(entities.get('rm_a1')).toEqual({ kind: 'room', id: 'rm_a1', name: 'A1' });
    expect(entities.get('gst_3')).toMatchObject({ name: 'Anna Example' });
  });

  it('keeps details from an earlier sighting when a later one knows less', () => {
    const entities = collectEntities([
      { bookingId: 'bk_1', guestName: 'Tomáš Novák', roomName: '104', checkIn: '2026-10-28' },
      { roomId: 'rm_104', roomName: '104', bookingId: 'bk_1', guestName: 'Tomáš Novák' },
    ]);
    expect(entities.get('bk_1')).toMatchObject({ checkIn: '2026-10-28', roomName: '104' });
  });
});

describe('parseInline', () => {
  it('picks out bracketed and bare mentions and bold text', () => {
    expect(parseInline('Yes: [[bk_1]] and bk_2 in **room** [[rm_104]].')).toEqual([
      { type: 'text', text: 'Yes: ' },
      { type: 'mention', id: 'bk_1' },
      { type: 'text', text: ' and ' },
      { type: 'mention', id: 'bk_2' },
      { type: 'text', text: ' in ' },
      { type: 'text', text: 'room', strong: true },
      { type: 'text', text: ' ' },
      { type: 'mention', id: 'rm_104' },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves other words with underscores alone', () => {
    expect(parseInline('see check_in and chg_1')).toEqual([
      { type: 'text', text: 'see check_in and chg_1' },
    ]);
  });
});

describe('parseAnswer', () => {
  it('splits paragraphs and lists, and leads list items with their booking', () => {
    const blocks = parseAnswer(
      'Today 3 guests arrive:\n\n- [[bk_1]] — 2 adults, children 5 and 9\n- [[bk_2]]: 1 adult\n- Room 103 is still dirty\n\nTwo bring children.',
    );
    expect(blocks).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Today 3 guests arrive:' }] },
      {
        type: 'list',
        items: [
          { lead: 'bk_1', content: [{ type: 'text', text: '2 adults, children 5 and 9' }] },
          { lead: 'bk_2', content: [{ type: 'text', text: '1 adult' }] },
          { lead: null, content: [{ type: 'text', text: 'Room 103 is still dirty' }] },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Two bring children.' }] },
    ]);
  });

  it('leads list items with their room', () => {
    expect(parseAnswer('- [[rm_104]] dirty, guest arriving at 3\n- rm_201: out of order')).toEqual([
      {
        type: 'list',
        items: [
          { lead: 'rm_104', content: [{ type: 'text', text: 'dirty, guest arriving at 3' }] },
          { lead: 'rm_201', content: [{ type: 'text', text: 'out of order' }] },
        ],
      },
    ]);
  });

  it('keeps a booking-only item with no detail', () => {
    expect(parseAnswer('- [[bk_1]]')).toEqual([
      { type: 'list', items: [{ lead: 'bk_1', content: [] }] },
    ]);
  });
});
