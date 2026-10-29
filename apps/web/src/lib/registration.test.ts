import { describe, expect, it } from 'vitest';
import {
  countryName,
  countryOptions,
  guestBookProgress,
  missingSummary,
  needsAddress,
  unaddedStillNeeded,
} from './registration';
import type { StayGuestView } from '@orbit/shared';

describe('needsAddress', () => {
  it('asks guests from abroad for an address', () => {
    expect(needsAddress('DE', 'CZ')).toBe(true);
    expect(needsAddress(' pl ', 'CZ')).toBe(true);
    expect(needsAddress('CZ', 'CZ')).toBe(false);
    expect(needsAddress('cz', 'CZ')).toBe(false);
  });

  it('waits for a complete code', () => {
    expect(needsAddress('', 'CZ')).toBe(false);
    expect(needsAddress('D', 'CZ')).toBe(false);
  });
});
describe('needsAddress in the US', () => {
  it('never asks for a home address, which the US guest book does not record', () => {
    expect(needsAddress('DE', 'US')).toBe(false);
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
    expect(countryName('BR')).toBe('BR');
    expect(countryName(null)).toBe(null);
  });
});

describe('guestBookProgress', () => {
  const people = (n: number, incomplete = 0) =>
    Array.from(
      { length: n },
      (_, i) => ({ missing: i < incomplete ? ['nationality'] : [] }) as StayGuestView,
    );

  it('counts the people with a complete entry where everyone is recorded', () => {
    expect(guestBookProgress({ guests: people(4, 1), partySize: 4, missing: 1, extra: 0 })).toBe(
      '3 of 4 in the guest book',
    );
    // Nobody added yet counts as missing too.
    expect(guestBookProgress({ guests: people(1), partySize: 4, missing: 3, extra: 0 })).toBe(
      '1 of 4 in the guest book',
    );
    expect(guestBookProgress({ guests: people(2), partySize: 2, missing: 0, extra: 0 })).toBe(
      'All 2 in the guest book',
    );
  });

  it('says what is left where only the guest who booked shows an ID', () => {
    expect(guestBookProgress({ guests: people(1, 1), partySize: 4, missing: 1, extra: 0 })).toBe(
      '1 person still to record',
    );
    expect(guestBookProgress({ guests: people(1), partySize: 4, missing: 0, extra: 0 })).toBe(
      'Guest book complete',
    );
  });

  it('says when more people are listed than the party', () => {
    expect(guestBookProgress({ guests: people(3), partySize: 2, missing: 0, extra: 1 })).toBe(
      '3 listed for a party of 2',
    );
  });
});

describe('unaddedStillNeeded', () => {
  const person = (missing: StayGuestView['missing']) => ({ missing }) as StayGuestView;

  it('counts people not added yet where the region records everyone', () => {
    // A party of 4, one person listed without an ID: the other three are missing too.
    expect(
      unaddedStillNeeded({ guests: [person(['documentNumber'])], partySize: 4, missing: 4 }),
    ).toBe(3);
  });

  it('needs nobody else where only the guest who booked shows an ID', () => {
    expect(
      unaddedStillNeeded({ guests: [person(['documentNumber'])], partySize: 4, missing: 1 }),
    ).toBe(0);
    expect(unaddedStillNeeded({ guests: [person([])], partySize: 4, missing: 0 })).toBe(0);
  });
});
