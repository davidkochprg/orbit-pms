import { describe, expect, it } from 'vitest';
import type { HousekeepingRoom, Inquiry } from '@orbit/shared';
import { accessLabel, contactName, contactWork, repairConversations, telHref } from './repairs';

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

describe('contactWork', () => {
  const task = (id: string, contactId: string | null, type = 'maintenance') => ({
    id,
    roomId: 'rm_1',
    type,
    status: 'in_progress',
    notes: `Task ${id}`,
    trade: null,
    contactId,
    createdAt: '2026-11-01T08:00:00.000Z',
  });
  const rooms = [
    { room: { name: '305' }, openTasks: [task('hk_1', 'ct_1'), task('hk_2', 'ct_2')] },
    { room: { name: '101' }, openTasks: [task('hk_3', 'ct_1', 'turnover')] },
  ] as unknown as HousekeepingRoom[];
  const mail = (id: string, overrides: Partial<Inquiry>) =>
    ({
      id,
      senderAddress: 'someone@example.com',
      taskId: null,
      trashedAt: null,
      lastMessageAt: '2026-11-01T08:00:00.000Z',
      ...overrides,
    }) as Inquiry;

  it('lists their open repairs and the emails from them or about those repairs', () => {
    const work = contactWork({ id: 'ct_1', email: 'Service@Electric.example' }, rooms, [
      mail('order', { senderAddress: 'service@electric.example' }),
      mail('repair', { taskId: 'hk_1', lastMessageAt: '2026-11-02T08:00:00.000Z' }),
      mail('other', { taskId: 'hk_2' }),
      mail('trashed', {
        senderAddress: 'service@electric.example',
        trashedAt: '2026-11-02T09:00:00.000Z',
      }),
    ]);
    expect(work.repairs).toEqual([{ taskId: 'hk_1', roomName: '305', notes: 'Task hk_1' }]);
    expect(work.emails.map((m) => m.id)).toEqual(['repair', 'order']);
  });
});
