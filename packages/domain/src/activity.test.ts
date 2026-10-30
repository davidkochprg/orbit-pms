import type { AuditLogEntry, StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { createActivityService, describeActivity, subjectKindOf } from './activity';
import { booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const manager: StaffMember = {
  id: 'stf_m',
  name: 'Test Manager',
  email: null,
  role: 'manager',
  language: 'cs',
  active: true,
};

function entry(overrides: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'action'>): AuditLogEntry {
  return {
    id: `audit_${overrides.action}`,
    actor: 'user',
    subjectId: null,
    payload: null,
    createdAt: '2026-05-10T08:00:00.000Z',
    ...overrides,
  };
}

const lookup = {
  bookings: [booking({ id: 'bk_1', roomId: 'rm_1', guestId: 'g1' })],
  guests: [
    {
      id: 'g1',
      name: 'Test Guest',
      email: null,
      phone: null,
      language: 'en' as const,
      notes: null,
    },
  ],
  rooms: [room('rm_1', { name: '101' })],
  roomTypes: [double],
  staff: [manager],
  inquiries: [],
};

describe('subjectKindOf', () => {
  it('maps action prefixes to what they are about', () => {
    expect(subjectKindOf('booking.check_in')).toBe('booking');
    expect(subjectKindOf('folio.payment')).toBe('booking');
    expect(subjectKindOf('task.create')).toBe('room');
    expect(subjectKindOf('room_type.update')).toBe('room_type');
    expect(subjectKindOf('staff.update')).toBe('staff');
    expect(subjectKindOf('settings.pricing')).toBeNull();
  });
});

describe('describeActivity', () => {
  it('names bookings, rooms and room types, and who made a change', () => {
    const items = describeActivity(
      [
        entry({ action: 'folio.charge', subjectId: 'bk_1' }),
        entry({ action: 'room.status', subjectId: 'rm_1' }),
        entry({ action: 'room_type.update', subjectId: double.id, payload: { by: 'stf_m' } }),
        entry({ action: 'settings.pricing', payload: { by: 'stf_m', changed: ['dog'] } }),
      ],
      lookup,
    );
    expect(items.map((i) => [i.subject?.label ?? null, i.byName])).toEqual([
      ['Test Guest, room 101', null],
      ['Room 101', null],
      ['Double', 'Test Manager'],
      [null, 'Test Manager'],
    ]);
    expect(items[0]?.subject).toEqual({
      kind: 'booking',
      id: 'bk_1',
      label: 'Test Guest, room 101',
    });
  });

  it('leaves out subjects that no longer exist', () => {
    const [item] = describeActivity(
      [entry({ action: 'booking.cancel', subjectId: 'gone' })],
      lookup,
    );
    expect(item?.subject).toBeNull();
  });
});

describe('createActivityService', () => {
  it('lists entries newest first, filtered by actor', async () => {
    const repos = createMemoryRepositories({ ...lookup, staff: [manager] });
    await repos.audit.append({
      actor: 'user',
      action: 'booking.confirm',
      subjectId: 'bk_1',
      payload: null,
    });
    await repos.audit.append({
      actor: 'agent',
      action: 'folio.charge',
      subjectId: 'bk_1',
      payload: null,
    });
    const service = createActivityService({ repos });
    expect((await service.list({ limit: 10 })).map((i) => i.action)).toEqual([
      'folio.charge',
      'booking.confirm',
    ]);
    expect((await service.list({ actor: 'agent', limit: 10 })).map((i) => i.action)).toEqual([
      'folio.charge',
    ]);
  });

  it('lists the changes to one booking, guest, room or conversation', async () => {
    const repos = createMemoryRepositories({ ...lookup, staff: [manager] });
    await repos.audit.append({
      actor: 'user',
      action: 'booking.confirm',
      subjectId: 'bk_1',
      payload: null,
    });
    await repos.audit.append({
      actor: 'user',
      action: 'room.status',
      subjectId: 'rm_1',
      payload: null,
    });
    const service = createActivityService({ repos });
    expect((await service.list({ subjectId: 'rm_1', limit: 10 })).map((i) => i.action)).toEqual([
      'room.status',
    ]);
  });
});
