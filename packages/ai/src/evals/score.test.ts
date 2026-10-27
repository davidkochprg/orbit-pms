import type { InquiryExtraction } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { scoreExtraction, scoreHousekeepingNote } from './score';

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
      { room: 'A1', status: 'clean' as const, issue: true },
      { room: '202', status: 'dirty' as const, issue: false },
    ],
    unclear: false,
  };

  it('passes matching rooms, statuses and issues, ignoring room case and issue wording', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'a1', status: 'clean', issue: 'Shower broken.' },
        { room: '202', status: 'dirty', issue: null },
      ],
      unclear: null,
    });
    expect(result).toEqual({ passed: true, problems: [] });
  });

  it('reads several updates for one room together', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'A1', status: 'clean', issue: null },
        { room: 'A1', status: null, issue: 'Shower broken.' },
        { room: '202', status: 'dirty', issue: null },
      ],
      unclear: null,
    });
    expect(result.passed).toBe(true);
  });

  it('reports wrong statuses, missing issues, extra rooms and unexpected unclear notes', () => {
    const result = scoreHousekeepingNote(fixture, {
      updates: [
        { room: 'A1', status: 'inspected', issue: null },
        { room: '305', status: 'clean', issue: null },
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
});
