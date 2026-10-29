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
      { roomId: 'rm_101', type: 'maintenance', notes: 'Lamp broken' },
      'user',
    );
    expect(task).toMatchObject({ id: 'hk_new1', status: 'open', notes: 'Lamp broken' });
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
          { room: 'pokoj 101', status: 'clean', issue: 'Lamp by the bed is broken' },
          { room: '102', status: 'inspected', issue: null },
          { room: '305', status: 'clean', issue: null },
        ],
        unclear: null,
      },
      '101 hotovo, lampa rozbitá. 102 zkontrolováno. 305 hotovo.',
      'agent',
    );
    expect(result.changes.map((c) => c.kind)).toEqual(['room_status', 'task_created']);
    expect(result.changes[0]).toMatchObject({ roomName: '101', from: 'dirty', to: 'clean' });
    expect(result.skipped.map((s) => s.room)).toEqual(['102', '305']);
    expect(repos.state.tasks.filter((t) => t.type === 'maintenance')).toHaveLength(1);
    expect(repos.state.audit.every((a) => a.actor === 'agent')).toBe(true);
  });
});
