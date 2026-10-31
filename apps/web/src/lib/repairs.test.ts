import { describe, expect, it } from 'vitest';
import { accessLabel, contactName, repairConversations, telHref } from './repairs';

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

  it("lists a repair's conversations, latest first, without the trash", () => {
    const at = (id: string, taskId: string | null, lastMessageAt: string) => ({
      id,
      taskId,
      lastMessageAt,
      trashedAt: null as string | null,
    });
    const inbox = [
      at('a', 'hk_1', '2026-11-01T09:00:00.000Z'),
      at('b', 'hk_2', '2026-11-02T09:00:00.000Z'),
      at('c', 'hk_1', '2026-11-03T09:00:00.000Z'),
      { ...at('d', 'hk_1', '2026-11-04T09:00:00.000Z'), trashedAt: '2026-11-04T10:00:00.000Z' },
      at('e', null, '2026-11-05T09:00:00.000Z'),
    ];
    expect(repairConversations('hk_1', inbox).map((m) => m.id)).toEqual(['c', 'a']);
  });

  it('names a contact with who to ask for', () => {
    expect(contactName({ name: 'Example Plumbing', person: 'Sam' })).toBe('Example Plumbing · Sam');
    expect(contactName({ name: 'Example Plumbing', person: null })).toBe('Example Plumbing');
  });
});
