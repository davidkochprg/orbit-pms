import type { InquiryExtraction } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { scoreExtraction } from './score';

const expected: InquiryExtraction = {
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
    expect(scoreExtraction(expected, { ...expected, guestName: null, childAges: [8, 4] })).toEqual({
      passed: true,
      failed: [],
    });
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
