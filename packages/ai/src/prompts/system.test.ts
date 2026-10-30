import { hotelPolicy, pricingConfig, usDemoPricing } from '@orbit/domain';
import type { HotelProfile } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { enforcedRules, hotelFacts, pricesSentence, timeOfDay } from './hotel';
import { buildSystemPrompt } from './system';

const profile: HotelProfile = {
  name: 'Test Lodge',
  location: 'Test Valley',
  description: 'Twelve rooms by a lake.',
  phone: null,
  email: 'desk@example.com',
  website: null,
  checkInFrom: '14:00',
  checkOutBy: '11:00',
  country: 'CZ',
  language: 'cs',
  coordinates: null,
  entries: [
    { id: 'quiet', category: 'policies', title: 'Quiet hours', details: 'From 22:00.' },
    {
      id: 'sauna',
      category: 'wellness',
      title: 'Sauna',
      details: 'Open 16:00 to 21:00.\nNo dogs, see [[Quiet hours]].',
      tags: ['sauna'],
    },
    { id: 'bus', category: 'getting_here', title: 'Bus', details: 'Stop 200 m from the house.' },
  ],
};
const hotel = { profile, policy: hotelPolicy, pricing: pricingConfig };

describe('hotelFacts', () => {
  const facts = hotelFacts(hotel);

  it('includes the profile, grouped by folder in their order', () => {
    expect(facts).toContain('Test Lodge, Test Valley. Twelve rooms by a lake.');
    expect(facts).toContain('Contact: email desk@example.com.');
    expect(facts).toContain('Check-in from 14:00, check-out by 11:00.');
    expect(facts).toContain('Policies:\n- Quiet hours: From 22:00.');
    expect(facts).toContain('Wellness:\n- Sauna: Open 16:00 to 21:00. No dogs, see Quiet hours.');
    expect(facts).toContain('Getting here:\n- Bus: Stop 200 m from the house.');
    expect(facts.indexOf('Wellness:')).toBeLessThan(facts.indexOf('Getting here:'));
  });

  it('leaves out empty sections and contact details', () => {
    const bare = hotelFacts({ ...hotel, profile: { ...profile, email: null, entries: [] } });
    expect(bare).not.toContain('Contact:');
    expect(bare).not.toContain('Wellness:');
  });

  it('states the rules the domain enforces', () => {
    expect(facts).toContain('Rules Orbit enforces:\n- A hold keeps a room for 48 hours');
    expect(enforcedRules({ holdHours: 24, dogsAllowedIn: ['room', 'apartment'] })).toEqual([
      'A hold keeps a room for 24 hours, then lapses.',
      'Dogs may stay in every room and apartment.',
    ]);
    expect(enforcedRules({ holdHours: 24, dogsAllowedIn: ['apartment'] })[1]).toBe(
      'Dogs may stay only in apartments.',
    );
    expect(enforcedRules({ holdHours: 24, dogsAllowedIn: [] })[1]).toBe('Dogs are not allowed.');
  });
});

describe('timeOfDay', () => {
  it('writes times as guests in the hotel country do', () => {
    expect(timeOfDay('15:00', 'US')).toBe('3 PM');
    expect(timeOfDay('07:30', 'US')).toBe('7:30 AM');
    expect(timeOfDay('12:00', 'US')).toBe('12 PM');
    expect(timeOfDay('15:00', 'CZ')).toBe('15:00');
  });
});

describe('pricesSentence', () => {
  it('states the currency, the basis and whether tax is included or added', () => {
    expect(pricesSentence(pricingConfig)).toBe(
      'Prices are in whole Czech crowns (CZK), per person per night, including VAT 12% on accommodation and VAT 21% on everything else.',
    );
    expect(pricesSentence(usDemoPricing)).toBe(
      'Prices are in whole US dollars, per room per night, before tax: the bill adds Occupancy tax 12% on accommodation and Sales tax 8.75% on everything else.',
    );
  });
});

describe('buildSystemPrompt', () => {
  const a = buildSystemPrompt({ hotel, today: '2026-10-27', timezone: 'Europe/Prague' });
  const b = buildSystemPrompt({ hotel, today: '2026-10-28', timezone: 'Europe/Prague' });

  it('injects hotel facts from the profile', () => {
    expect(a).toContain(hotelFacts(hotel));
  });

  it('keeps everything except the date identical across days, so the prefix stays cacheable', () => {
    const shared = a.slice(0, a.indexOf('Today is'));
    expect(b.startsWith(shared)).toBe(true);
    expect(a.endsWith('Today is 2026-10-27 (Europe/Prague).')).toBe(true);
  });
});
