import { describe, expect, it } from 'vitest';
import { holdExpiry } from './inbox';

describe('holdExpiry', () => {
  const end = '2026-10-31T21:10:00.000Z';

  it("writes when a hold ends in the hotel's time zone and clock", () => {
    expect(holdExpiry(end, 'US', 'America/Los_Angeles')).toBe('Saturday, October 31 at 2:10 PM');
    expect(holdExpiry(end, 'CZ', 'Europe/Prague')).toBe('Saturday 31 October at 22:10');
  });
});
