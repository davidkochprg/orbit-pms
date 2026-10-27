import { describe, expect, it } from 'vitest';
import { hotelProfile } from '../hotel';
import { buildSystemPrompt } from './system';

describe('buildSystemPrompt', () => {
  const a = buildSystemPrompt({
    hotel: hotelProfile,
    today: '2026-10-27',
    timezone: 'Europe/Prague',
  });
  const b = buildSystemPrompt({
    hotel: hotelProfile,
    today: '2026-10-28',
    timezone: 'Europe/Prague',
  });

  it('injects hotel facts from the profile', () => {
    expect(a).toContain(hotelProfile.name);
    expect(a).toContain(hotelProfile.checkOutBy);
    for (const policy of hotelProfile.policies) expect(a).toContain(policy);
  });

  it('keeps everything except the date identical across days, so the prefix stays cacheable', () => {
    const shared = a.slice(0, a.indexOf('Today is'));
    expect(b.startsWith(shared)).toBe(true);
    expect(a.endsWith('Today is 2026-10-27 (Europe/Prague).')).toBe(true);
  });
});
