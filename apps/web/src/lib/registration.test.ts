import { describe, expect, it } from 'vitest';
import {
  countryName,
  countryOptions,
  guestBookProgress,
  missingSummary,
  needsAddress,
} from './registration';

describe('needsAddress', () => {
  it('asks guests from abroad for an address', () => {
    expect(needsAddress('DE')).toBe(true);
    expect(needsAddress(' pl ')).toBe(true);
    expect(needsAddress('CZ')).toBe(false);
    expect(needsAddress('cz')).toBe(false);
  });

  it('waits for a complete code', () => {
    expect(needsAddress('')).toBe(false);
    expect(needsAddress('D')).toBe(false);
  });
});

describe('countryOptions', () => {
  it('lists unique two-letter codes', () => {
    const codes = countryOptions.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
  });
});

describe('missingSummary', () => {
  it('names what a guest-book entry still needs', () => {
    expect(missingSummary([])).toBe(null);
    expect(missingSummary(['address'])).toBe('Needs home address');
    expect(missingSummary(['dateOfBirth', 'documentType', 'documentNumber'])).toBe(
      'Needs date of birth and ID document',
    );
    expect(missingSummary(['nationality', 'dateOfBirth', 'documentNumber'])).toBe(
      'Needs nationality, date of birth and ID document',
    );
  });
});

describe('countryName', () => {
  it('names known countries and falls back to the code', () => {
    expect(countryName('DE')).toBe('Germany');
    expect(countryName('FR')).toBe('FR');
    expect(countryName(null)).toBe(null);
  });
});

describe('guestBookProgress', () => {
  it('counts the people with a complete entry', () => {
    expect(guestBookProgress({ partySize: 4, missing: 1, extra: 0 })).toBe(
      '3 of 4 in the guest book',
    );
    expect(guestBookProgress({ partySize: 2, missing: 0, extra: 0 })).toBe(
      'All 2 in the guest book',
    );
  });

  it('says when more people are listed than the party', () => {
    expect(guestBookProgress({ partySize: 2, missing: 0, extra: 1 })).toBe(
      '3 listed for a party of 2',
    );
  });
});
