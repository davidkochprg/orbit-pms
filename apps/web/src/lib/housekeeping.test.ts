import type { HousekeepingTask } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { changeLabel, formatSeconds, taskLabel } from './housekeeping';

const task = (overrides: Partial<HousekeepingTask>): HousekeepingTask => ({
  id: 'hk_1',
  roomId: 'rm_104',
  type: 'maintenance',
  status: 'open',
  notes: 'Bedside lamp is broken.',
  createdAt: '2026-10-27T08:00:00.000Z',
  ...overrides,
});

describe('housekeeping labels', () => {
  it('names tasks by what needs doing', () => {
    expect(taskLabel(task({}))).toBe('Bedside lamp is broken.');
    expect(taskLabel(task({ type: 'turnover', notes: null }))).toBe('Turnover cleaning');
    expect(taskLabel(task({ type: 'stayover', notes: null }))).toBe('Stayover service');
  });

  it('describes what a note changed', () => {
    expect(
      changeLabel({
        kind: 'room_status',
        roomId: 'rm_104',
        roomName: '104',
        from: 'dirty',
        to: 'clean',
      }),
    ).toBe('Room 104: Dirty → Clean');
    expect(changeLabel({ kind: 'task_created', roomName: '104', task: task({}) })).toBe(
      'New task in 104: Bedside lamp is broken.',
    );
  });

  it('formats a recording timer', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(65)).toBe('1:05');
  });
});
