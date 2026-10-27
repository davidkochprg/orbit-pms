import { inquiryExtractionSchema, languages } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { buildInquiryFixtures } from './inquiries';

const today = '2026-10-27';
const fixtures = buildInquiryFixtures(today);
const bookings = fixtures.filter((f) => f.expected.kind === 'booking_request');

describe('buildInquiryFixtures', () => {
  it('builds fourteen messages with unique ids, five of them relayed by Booking.com', () => {
    expect(fixtures).toHaveLength(14);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(14);
    expect(fixtures.filter((f) => f.partner === 'Booking.com')).toHaveLength(5);
    expect(fixtures.filter((f) => f.expected.kind === 'question')).toHaveLength(3);
  });

  it('covers every guest language', () => {
    expect(new Set(fixtures.map((f) => f.expected.language))).toEqual(new Set(languages));
  });

  it('has valid expected extractions, with future stays for booking requests', () => {
    for (const f of fixtures) {
      expect(inquiryExtractionSchema.parse(f.expected)).toEqual(f.expected);
    }
    for (const f of bookings) {
      expect(f.expected.checkIn! > today).toBe(true);
      expect(f.expected.adults).toBeGreaterThan(0);
      expect(f.rawText).toContain(String(Number(f.expected.checkIn!.slice(8))));
    }
  });

  it('uses only reserved example domains for email addresses', () => {
    for (const f of fixtures) {
      for (const email of `${f.rawText} ${f.senderAddress ?? ''}`.match(/\S+@\S+/g) ?? []) {
        expect(email).toMatch(/@example\.com$/);
      }
    }
  });
});
