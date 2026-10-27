import { inquiryExtractionSchema, languages } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { buildInquiryFixtures } from './inquiries';

const fixtures = buildInquiryFixtures('2026-10-27');

describe('buildInquiryFixtures', () => {
  it('builds ten inquiries with unique ids', () => {
    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(10);
  });

  it('covers every guest language', () => {
    expect(new Set(fixtures.map((f) => f.expected.language))).toEqual(new Set(languages));
  });

  it('has valid, future expected extractions', () => {
    for (const f of fixtures) {
      expect(inquiryExtractionSchema.parse(f.expected)).toEqual(f.expected);
      expect(f.expected.checkIn > '2026-10-27').toBe(true);
    }
  });

  it('puts both dates in the raw text in some form', () => {
    for (const f of fixtures) {
      const day = String(Number(f.expected.checkIn.slice(8)));
      expect(f.rawText).toContain(day);
    }
  });

  it('uses only reserved example domains for email addresses', () => {
    for (const f of fixtures) {
      for (const email of f.rawText.match(/\S+@\S+/g) ?? []) {
        expect(email).toMatch(/@example\.com$/);
      }
    }
  });
});
