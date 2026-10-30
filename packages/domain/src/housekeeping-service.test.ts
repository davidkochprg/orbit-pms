import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { createHousekeepingService } from './housekeeping-service';
import { booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');

function setup() {
  const repos = createMemoryRepositories(
    {
      roomTypes: [double],
      rooms: [
        room('rm_101', { name: '101', status: 'dirty' }),
        room('rm_102', { name: '102', status: 'out_of_order' }),
      ],
      bookings: [booking({ roomId: 'rm_101', checkIn: '2026-05-10', checkOut: '2026-05-12' })],
      tasks: [
        {
          id: 'hk_1',
          roomId: 'rm_101',
          type: 'turnover',
          status: 'open',
          notes: null,
          trade: null,
          contactId: null,
          createdAt: now.toISOString(),
        },
      ],
    },
    () => now,
  );
  let n = 0;
  const service = createHousekeepingService({
    repos,
    clock: () => now,
    newId: (prefix) => `${prefix}_new${++n}`,
  });
  return { repos, service };
}

describe('housekeeping service', () => {
  it('builds the board for the hotel day', async () => {
    const { service } = setup();
    const board = await service.board();
    expect(board.date).toBe('2026-05-10');
    expect(board.rooms[0]).toMatchObject({ occupancy: 'arriving', urgent: true });
  });

  it('marks a room clean, completes its cleaning task and logs it', async () => {
    const { repos, service } = setup();
    await service.setRoomStatus('rm_101', 'clean', 'user');
    expect(repos.state.rooms.find((r) => r.id === 'rm_101')!.status).toBe('clean');
    expect(repos.state.tasks[0]!.status).toBe('done');
    expect(repos.state.audit.map((a) => [a.action, a.subjectId, a.payload])).toEqual([
      ['room.status', 'rm_101', { from: 'dirty', to: 'clean' }],
    ]);
  });

  it('refuses to make an out-of-order room clean and changes nothing', async () => {
    const { repos, service } = setup();
    await expect(service.setRoomStatus('rm_102', 'clean', 'user')).rejects.toThrow(DomainError);
    expect(repos.state.rooms.find((r) => r.id === 'rm_102')!.status).toBe('out_of_order');
    expect(repos.state.audit).toEqual([]);
  });

  it('requires a description for maintenance tasks', async () => {
    const { service } = setup();
    await expect(
      service.createTask({ roomId: 'rm_101', type: 'maintenance', notes: ' ' }, 'user'),
    ).rejects.toThrow('Describe what needs fixing');
    const task = await service.createTask(
      { roomId: 'rm_101', type: 'maintenance', notes: 'Lamp broken', trade: 'electrical' },
      'user',
    );
    expect(task).toMatchObject({
      id: 'hk_new1',
      status: 'open',
      notes: 'Lamp broken',
      trade: 'electrical',
      contactId: null,
    });
  });

  it('keeps a trade only on a repair', async () => {
    const { service } = setup();
    const cleaning = await service.createTask(
      { roomId: 'rm_101', type: 'turnover', notes: null, trade: 'plumbing' },
      'user',
    );
    expect(cleaning.trade).toBeNull();
  });

  it('updates a task status', async () => {
    const { service } = setup();
    expect((await service.setTaskStatus('hk_1', 'in_progress', 'user')).status).toBe('in_progress');
    await expect(service.setTaskStatus('hk_x', 'done', 'user')).rejects.toThrow('not found');
  });

  it('reads one task', async () => {
    const { service } = setup();
    expect(await service.getTask('hk_1')).toMatchObject({ id: 'hk_1' });
    await expect(service.getTask('hk_x')).rejects.toThrow('not found');
  });

  it('applies a note: status changes and maintenance tasks, skipping what it cannot do', async () => {
    const { repos, service } = setup();
    const result = await service.applyNote(
      {
        updates: [
          {
            room: 'pokoj 101',
            status: 'clean',
            issue: 'Lamp by the bed is broken',
            trade: 'electrical',
          },
          { room: '102', status: 'inspected', issue: null, trade: null },
          { room: '305', status: 'clean', issue: null, trade: null },
        ],
        unclear: null,
      },
      '101 hotovo, lampa rozbitá. 102 zkontrolováno. 305 hotovo.',
      'agent',
    );
    expect(result.changes.map((c) => c.kind)).toEqual(['room_status', 'task_created']);
    expect(result.changes[0]).toMatchObject({ roomName: '101', from: 'dirty', to: 'clean' });
    expect(result.skipped.map((s) => s.room)).toEqual(['102', '305']);
    expect(repos.state.tasks.filter((t) => t.type === 'maintenance')).toEqual([
      expect.objectContaining({ notes: 'Lamp by the bed is broken', trade: 'electrical' }),
    ]);
    expect(repos.state.audit.every((a) => a.actor === 'agent')).toBe(true);
  });

  it('lists the stays whose text the model has not read, and keeps what it read', async () => {
    const { repos, service } = setup();
    repos.state.bookings[0]!.notes = 'Bringing our dog Rex.';
    expect((await service.board()).unreadStays).toBe(1);
    const stays = await service.staysToRead();
    expect(stays).toEqual([
      { bookingId: repos.state.bookings[0]!.id, source: 'Booking notes: Bringing our dog Rex.' },
    ]);

    await service.saveStayReadings(stays, [
      {
        bookingId: stays[0]!.bookingId,
        pets: true,
        mess: 'usual',
        messReason: 'none',
        prepare: ['dog bowl'],
      },
    ]);
    expect(repos.state.stayReadings).toEqual([
      {
        bookingId: stays[0]!.bookingId,
        pets: true,
        mess: 'usual',
        messReason: null,
        prepare: ['Dog bowl'],
        source: stays[0]!.source,
        readAt: now.toISOString(),
      },
    ]);
    const board = await service.board();
    expect(board.unreadStays).toBe(0);
    expect(board.rooms[0]!.cues).toEqual(['Dog bowl']);

    // A changed note is read again; until then the old reading still counts.
    repos.state.bookings[0]!.notes = 'Bringing our dog Rex and a cat.';
    const changed = await service.board();
    expect(changed.unreadStays).toBe(1);
    expect(changed.rooms[0]!.cues).toEqual(['Dog bowl']);
  });

  it('saves a stay the model skipped as nothing unusual, so it is not read again', async () => {
    const { repos, service } = setup();
    repos.state.bookings[0]!.notes = 'Quiet room please.';
    await service.saveStayReadings(await service.staysToRead(), []);
    expect(repos.state.stayReadings[0]).toMatchObject({ pets: false, mess: 'usual', prepare: [] });
    expect(await service.staysToRead()).toEqual([]);
  });
});
