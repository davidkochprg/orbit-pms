import type { HousekeepingRoom, HousekeepingTask } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  changeLabel,
  effortSummary,
  formatSeconds,
  needsAction,
  nextRoomStep,
  taskLabel,
} from './housekeeping';

const task = (overrides: Partial<HousekeepingTask>): HousekeepingTask => ({
  id: 'hk_1',
  roomId: 'rm_104',
  type: 'maintenance',
  status: 'open',
  trade: null,
  contactId: null,
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

describe('effortSummary', () => {
  it('names the effort and why', () => {
    expect(effortSummary('heavy', ['Dog', '2 kids'])).toBe('Heavy clean: Dog, 2 kids');
    expect(effortSummary('light', [])).toBe('Light clean');
  });
});

describe('nextRoomStep', () => {
  it('moves a room on: cleaned, then inspected; a repaired room back to cleaning', () => {
    expect(nextRoomStep('dirty')).toEqual({ status: 'clean', label: 'Mark clean' });
    expect(nextRoomStep('clean')).toEqual({ status: 'inspected', label: 'Mark inspected' });
    expect(nextRoomStep('out_of_order')).toEqual({ status: 'dirty', label: 'Back in service' });
    expect(nextRoomStep('inspected')).toBeNull();
  });
});

describe('needsAction', () => {
  const room = (over: Partial<HousekeepingRoom> & { status?: 'clean' | 'dirty' }) =>
    ({
      room: { id: 'rm_1', name: '101', status: over.status ?? 'clean' },
      occupancy: 'staying',
      urgent: false,
      openTasks: [],
      ...over,
    }) as HousekeepingRoom;

  it('leaves a clean room with only its stayover service for later', () => {
    expect(needsAction(room({ openTasks: [{ type: 'stayover' } as HousekeepingTask] }))).toBe(
      false,
    );
  });

  it('brings forward arrivals, repairs and rooms that are not clean', () => {
    expect(needsAction(room({ occupancy: 'arriving' }))).toBe(true);
    expect(needsAction(room({ openTasks: [{ type: 'maintenance' } as HousekeepingTask] }))).toBe(
      true,
    );
    expect(needsAction(room({ status: 'dirty' }))).toBe(true);
  });
});
