import type {
  HousekeepingChange,
  HousekeepingTask,
  HousekeepingTaskStatus,
  RoomOccupancy,
  RoomStatus,
} from '@orbit/shared';
import { roomStatusLabels } from './status';

/**
 * The step a room usually takes next, as a one-tap button on its card: cleaned, then inspected; a
 * repaired room goes back to dirty for cleaning. Null when there is no usual next step.
 */
export function nextRoomStep(status: RoomStatus): { status: RoomStatus; label: string } | null {
  switch (status) {
    case 'dirty':
      return { status: 'clean', label: 'Mark clean' };
    case 'clean':
      return { status: 'inspected', label: 'Mark inspected' };
    case 'out_of_order':
      return { status: 'dirty', label: 'Back in service' };
    case 'inspected':
      return null;
  }
}

/** Board columns, in the order rooms move through them. */
export const boardColumns: RoomStatus[] = ['dirty', 'clean', 'inspected', 'out_of_order'];

export const occupancyLabels: Record<RoomOccupancy, string> = {
  turnover: 'Turnover',
  arriving: 'Arrival',
  departing: 'Departure',
  staying: 'Stayover',
  vacant: 'Vacant',
};

export const taskStatusLabels: Record<HousekeepingTaskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
};

export function taskLabel(task: HousekeepingTask): string {
  if (task.type === 'maintenance') return task.notes ?? 'Maintenance';
  return task.type === 'turnover' ? 'Turnover cleaning' : 'Stayover service';
}

/** One line per change a note made, e.g. "Room 104: Dirty → Clean". */
export function changeLabel(change: HousekeepingChange): string {
  return change.kind === 'room_status'
    ? `Room ${change.roomName}: ${roomStatusLabels[change.from]} → ${roomStatusLabels[change.to]}`
    : `New task in ${change.roomName}: ${change.task.notes ?? 'Maintenance'}`;
}

/** "1:05" */
export function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
