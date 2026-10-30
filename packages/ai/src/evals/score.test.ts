import type { InquiryExtraction } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { scoreExtraction, scoreHousekeepingNote, scoreStayReadings } from './score';

const expected: InquiryExtraction = {
  kind: 'booking_request',
  question: null,
  language: 'de',
  guestName: 'Familie Beispiel',
  checkIn: '2026-11-06',
  checkOut: '2026-11-10',
  adults: 2,
  childAges: [4, 8],
  wishes: { wellness: false, dog: false, apartment: true },
};

describe('scoreExtraction', () => {
  it('passes an exact match regardless of child age order and name', () => {
    expect(
      scoreExtraction(expected, {
        ...expected,
        guestName: null,
        question: 'Price?',
        childAges: [8, 4],
      }),
    ).toEqual({
      passed: true,
      failed: [],
    });
  });

  it('fails a misclassified message', () => {
    expect(scoreExtraction(expected, { ...expected, kind: 'question' }).failed).toEqual(['kind']);
  });

  it('lists every failed field', () => {
    const actual = {
      ...expected,
      checkOut: '2026-11-11',
      adults: 3,
      wishes: { ...expected.wishes, dog: true },
    };
    expect(scoreExtraction(expected, actual)).toEqual({
      passed: false,
      failed: ['dates', 'adults', 'wishes'],
    });
  });
});

describe('scoreHousekeepingNote', () => {
  const fixture = {
    expected: [
      { room: 'A1', status: 'clean' as const, issue: true, trade: ['plumbing' as const] },
      { room: '202', status: 'dirty' as const, issue: false },
    ],
    unclear: false,
  };

  it('passes matching rooms, statuses and issues, ignoring room case and issue wording', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'a1', status: 'clean', issue: 'Shower broken.', trade: 'plumbing' },
        { room: '202', status: 'dirty', issue: null, trade: null },
      ],
      unclear: null,
    });
    expect(result).toEqual({ passed: true, problems: [] });
  });

  it('reads several updates for one room together', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'A1', status: 'clean', issue: null, trade: null },
        { room: 'A1', status: null, issue: 'Shower broken.', trade: 'plumbing' },
        { room: '202', status: 'dirty', issue: null, trade: null },
      ],
      unclear: null,
    });
    expect(result.passed).toBe(true);
  });

  it('reports wrong statuses, missing issues, extra rooms and unexpected unclear notes', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'A1', status: 'inspected', issue: null, trade: null },
        { room: '305', status: 'clean', issue: null, trade: null },
      ],
      unclear: 'Something else.',
    });
    expect(result.problems).toEqual([
      'A1 status inspected != clean',
      'A1 issue false != true',
      'missing 202',
      'unexpected 305',
      'unexpected unclear',
    ]);
  });

  it('reports an issue sent to the wrong trade', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'A1', status: 'clean', issue: 'Shower broken.', trade: 'electrical' },
        { room: '202', status: 'dirty', issue: null, trade: null },
      ],
      unclear: null,
    });
    expect(result.problems).toEqual(['A1 trade electrical not plumbing']);
  });
});

describe('scoreStayReadings', () => {
  const fixture = {
    id: 't',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_1',
        source: 'x',
        pets: true,
        mess: ['usual' as const],
        prepare: [['cot', 'crib']],
      },
      { bookingId: 'bk_2', source: 'y', pets: false, mess: ['more' as const], prepare: [] },
    ],
  };
  const read = (bookingId: string, overrides = {}) => ({
    bookingId,
    pets: false,
    mess: 'usual' as const,
    messReason: null,
    prepare: [] as string[],
    ...overrides,
  });

  it('passes a matching reading, finding things to set up by any of their words', () => {
    expect(
      scoreStayReadings(fixture, {
        stays: [
          read('bk_1', { pets: true, prepare: ['Baby crib'] }),
          read('bk_2', { mess: 'more', messReason: 'Muddy' }),
        ],
      }),
    ).toEqual({ passed: true, problems: [] });
  });

  it('reports wrong pets, mess, prepare and missing or unknown stays', () => {
    expect(
      scoreStayReadings(fixture, {
        stays: [read('bk_1', { prepare: ['Towels'] }), read('bk_9')],
      }).problems,
    ).toEqual([
      'bk_1 pets false',
      'bk_1 prepare misses cot',
      'bk_2 read 0 times',
      'unexpected bk_9',
    ]);
    expect(
      scoreStayReadings(fixture, {
        stays: [read('bk_1', { pets: true, prepare: ['Cot'] }), read('bk_2', { prepare: ['Cot'] })],
      }).problems,
    ).toEqual(['bk_2 mess usual', 'bk_2 prepare ["Cot"]']);
  });
});
