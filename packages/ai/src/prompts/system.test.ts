import { hotelPolicy } from '@orbit/domain';
import type { HotelProfile } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { enforcedRules, hotelFacts } from './hotel';
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
  entries: [
    { id: 'quiet', category: 'policy', title: 'Quiet hours', details: 'From 22:00.' },
    { id: 'sauna', category: 'amenity', title: 'Sauna', details: 'Open 16:00 to 21:00.' },
    { id: 'bus', category: 'info', title: 'Bus', details: 'Stop 200 m from the house.' },
  ],
};
const hotel = { profile, policy: hotelPolicy };

describe('hotelFacts', () => {
  const facts = hotelFacts(hotel);

  it('includes the profile, grouped by category', () => {
    expect(facts).toContain('Test Lodge, Test Valley. Twelve rooms by a lake.');
    expect(facts).toContain('Contact: email desk@example.com.');
    expect(facts).toContain('Check-in from 14:00, check-out by 11:00.');
    expect(facts).toContain('House policies:\n- Quiet hours: From 22:00.');
    expect(facts).toContain('Amenities:\n- Sauna: Open 16:00 to 21:00.');
    expect(facts).toContain('Guest information:\n- Bus: Stop 200 m from the house.');
  });

  it('leaves out empty sections and contact details', () => {
    const bare = hotelFacts({ ...hotel, profile: { ...profile, email: null, entries: [] } });
    expect(bare).not.toContain('Contact:');
    expect(bare).not.toContain('Amenities:');
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
