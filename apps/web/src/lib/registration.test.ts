import { describe, expect, it } from 'vitest';
import { countryOptions, needsAddress } from './registration';

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
