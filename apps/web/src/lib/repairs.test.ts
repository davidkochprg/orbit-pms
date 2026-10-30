import { describe, expect, it } from 'vitest';
import { accessLabel, contactName, mailtoHref, telHref } from './repairs';

describe('accessLabel', () => {
  it('says how long an empty room is free', () => {
    expect(accessLabel({ guestName: null, freeFrom: '2026-11-03', freeUntil: null })).toBe(
      'Free now',
    );
    expect(accessLabel({ guestName: null, freeFrom: '2026-11-03', freeUntil: '2026-11-07' })).toBe(
      'Free until Sat, Nov 7',
    );
    expect(accessLabel({ guestName: null, freeFrom: '2026-11-03', freeUntil: '2026-11-03' })).toBe(
      'Free until today’s arrival',
    );
  });

  it('says when a room with a guest in it is free', () => {
    expect(
      accessLabel({ guestName: 'Avery', freeFrom: '2026-11-05', freeUntil: '2026-11-07' }),
    ).toBe('Free Thu, Nov 5 – Sat, Nov 7');
    expect(accessLabel({ guestName: 'Avery', freeFrom: '2026-11-05', freeUntil: null })).toBe(
      'Free from Thu, Nov 5',
    );
  });
});

describe('links', () => {
  it('dials the digits of a phone number', () => {
    expect(telHref('(530) 555-0142')).toBe('tel:5305550142');
    expect(telHref('+420 555 010 142')).toBe('tel:+420555010142');
  });

  it('opens an email with its subject and body, spaces kept as spaces', () => {
    expect(
      mailtoHref({ to: 'sam@plumbing.example', subject: 'Tap in 203', body: 'Hi Sam,\nThanks' }),
    ).toBe('mailto:sam@plumbing.example?subject=Tap%20in%20203&body=Hi%20Sam%2C%0AThanks');
    expect(mailtoHref({ to: null, subject: 'S', body: 'B' })).toBe('mailto:?subject=S&body=B');
  });

  it('names a contact with who to ask for', () => {
    expect(contactName({ name: 'Example Plumbing', person: 'Sam' })).toBe('Example Plumbing · Sam');
    expect(contactName({ name: 'Example Plumbing', person: null })).toBe('Example Plumbing');
  });
});
