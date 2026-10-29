import type { Inquiry, StayReading } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { cleaningEffort, normalizeStayReading, staySource } from './cleaning-effort';
import { booking } from './test-fixtures';

const today = '2026-05-10';
const leaving = (overrides: Partial<Parameters<typeof booking>[0]> = {}) =>
  booking({
    roomId: 'r1',
    checkIn: '2026-05-08',
    checkOut: today,
    status: 'checked_out',
    ...overrides,
  });
const arriving = (overrides: Partial<Parameters<typeof booking>[0]> = {}) =>
  booking({ roomId: 'r1', checkIn: today, checkOut: '2026-05-12', ...overrides });
const dogs = (n: number) => ({ wellness: false, dogs: n, extraBeds: 0 });

function read(bookingId: string, overrides: Partial<StayReading> = {}): StayReading {
  return { bookingId, pets: false, mess: 'usual', messReason: null, prepare: [], ...overrides };
}
const none = new Map<string, StayReading>();

describe('cleaningEffort', () => {
  it('has nothing for a vacant room', () => {
    expect(
      cleaningEffort({ occupancy: 'vacant', stay: null, arrival: null, readings: none }),
    ).toEqual({ effort: null, cues: [] });
  });

  it('rates a plain stayover light and a plain departure standard', () => {
    const stay = leaving();
    expect(cleaningEffort({ occupancy: 'staying', stay, arrival: null, readings: none })).toEqual({
      effort: 'light',
      cues: [],
    });
    expect(cleaningEffort({ occupancy: 'departing', stay, arrival: null, readings: none })).toEqual(
      { effort: 'standard', cues: [] },
    );
  });

  it('makes a family with a dog a heavy clean', () => {
    const stay = leaving({ childAges: [2, 5, 8], addons: dogs(1) });
    expect(cleaningEffort({ occupancy: 'departing', stay, arrival: null, readings: none })).toEqual(
      { effort: 'heavy', cues: ['Dog', '3 kids'] },
    );
  });

  it('counts a dog the notes mention once, even when it is also booked', () => {
    const booked = leaving({ addons: dogs(2) });
    const readings = new Map([[booked.id, read(booked.id, { pets: true })]]);
    expect(
      cleaningEffort({ occupancy: 'staying', stay: booked, arrival: null, readings }).cues,
    ).toEqual(['2 dogs']);

    const unbooked = leaving();
    const fromNotes = new Map([[unbooked.id, read(unbooked.id, { pets: true })]]);
    expect(
      cleaningEffort({ occupancy: 'staying', stay: unbooked, arrival: null, readings: fromNotes }),
    ).toEqual({ effort: 'standard', cues: ['Dog'] });
  });

  it('adds a long stay only when the guest leaves, from 7 nights', () => {
    const six = leaving({ checkIn: '2026-05-04' });
    const seven = leaving({ checkIn: '2026-05-03' });
    const effort = (stay: typeof six, occupancy: 'departing' | 'staying') =>
      cleaningEffort({ occupancy, stay, arrival: null, readings: none });
    expect(effort(six, 'departing')).toEqual({ effort: 'standard', cues: [] });
    expect(effort(seven, 'departing')).toEqual({ effort: 'standard', cues: ['Long stay'] });
    expect(effort(seven, 'staying').cues).toEqual([]);
  });

  it('adds the mess the notes mention, with its reason', () => {
    const stay = leaving();
    const more = new Map([[stay.id, read(stay.id, { mess: 'more', messReason: 'Muddy boots' })]]);
    const much = new Map([[stay.id, read(stay.id, { mess: 'much_more', messReason: null })]]);
    expect(cleaningEffort({ occupancy: 'departing', stay, arrival: null, readings: more })).toEqual(
      { effort: 'standard', cues: ['Muddy boots'] },
    );
    expect(cleaningEffort({ occupancy: 'departing', stay, arrival: null, readings: much })).toEqual(
      { effort: 'heavy', cues: ['Extra mess'] },
    );
  });

  it('adds what to set up for the guest arriving, after the mess of the one leaving', () => {
    const stay = leaving({ addons: dogs(1) });
    const arrival = arriving({ addons: { wellness: false, dogs: 0, extraBeds: 1 } });
    const readings = new Map([[arrival.id, read(arrival.id, { prepare: ['Cot'] })]]);
    expect(cleaningEffort({ occupancy: 'turnover', stay, arrival, readings })).toEqual({
      effort: 'heavy',
      cues: ['Dog', 'Extra bed', 'Cot'],
    });
    expect(cleaningEffort({ occupancy: 'arriving', stay: null, arrival, readings })).toEqual({
      effort: 'light',
      cues: ['Extra bed', 'Cot'],
    });
  });

  it('shows at most four distinct cues', () => {
    const stay = leaving({ checkIn: '2026-05-01', childAges: [4], addons: dogs(1) });
    const arrival = arriving();
    const readings = new Map([
      [stay.id, read(stay.id, { mess: 'more', messReason: 'Sand' })],
      [arrival.id, read(arrival.id, { prepare: ['Cot', 'cot', 'Flowers'] })],
    ]);
    expect(cleaningEffort({ occupancy: 'turnover', stay, arrival, readings })).toEqual({
      effort: 'heavy',
      cues: ['Dog', '1 kid', 'Long stay', 'Sand'],
    });
  });
});

describe('normalizeStayReading', () => {
  it('keeps cues short, distinct and capitalised', () => {
    expect(
      normalizeStayReading(
        read('bk_1', {
          mess: 'more',
          messReason: 'celebrating a big birthday party with friends.',
          prepare: [' cot ', 'Cot', 'feather-free bedding', 'flowers', 'balloons', ''],
        }),
      ),
    ).toEqual(
      read('bk_1', {
        mess: 'more',
        messReason: 'Celebrating a big',
        prepare: ['Cot', 'Feather-free bedding', 'Flowers'],
      }),
    );
  });

  it('drops a mess reason when the mess is usual', () => {
    expect(normalizeStayReading(read('bk_1', { messReason: 'Nothing' })).messReason).toBeNull();
  });
});

describe('staySource', () => {
  const stay = arriving({ id: 'bk_1', notes: 'Late arrival.' });
  const guest = {
    id: 'gst_test',
    name: 'Test Guest',
    email: null,
    phone: null,
    language: 'en' as const,
    notes: 'Allergic to feathers',
  };
  const inquiry = (bookingId: string | null, bodies: [string, 'in' | 'out'][]) =>
    ({
      bookingId,
      messages: bodies.map(([body, direction], i) => ({
        id: `m${i}`,
        inquiryId: 'inq',
        direction,
        body,
        sentAt: `2026-05-0${i + 1}T10:00:00.000Z`,
        author: null,
        translation: null,
      })),
    }) as unknown as Inquiry;

  it("joins the notes and the guest's own messages about the booking", () => {
    const inquiries = [
      inquiry('bk_1', [
        ['We bring our dog.', 'in'],
        ['Dogs are welcome.', 'out'],
        ['  ', 'in'],
      ]),
      inquiry('bk_other', [['Another stay.', 'in']]),
    ];
    expect(staySource(stay, guest, inquiries)).toBe(
      'Booking notes: Late arrival.\nGuest notes: Allergic to feathers\nGuest messages:\n- We bring our dog.',
    );
  });

  it('reads only the five latest messages', () => {
    const many = inquiry(
      'bk_1',
      ['1', '2', '3', '4', '5', '6', '7'].map((n) => [`Message ${n}`, 'in'] as [string, 'in']),
    );
    const source = staySource(arriving({ id: 'bk_1' }), undefined, [many]);
    expect(source).not.toContain('Message 2');
    expect(source).toContain('Message 3');
    expect(source).toContain('Message 7');
  });

  it('is empty when there is nothing to read', () => {
    expect(staySource(arriving(), { ...guest, notes: null }, [])).toBe('');
  });
});
