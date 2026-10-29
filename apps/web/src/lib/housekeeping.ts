import type {
  CleaningEffort,
  HousekeepingChange,
  HousekeepingRoom,
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

/**
 * Whether a room on the board needs someone today: an arrival, a turnover or departure, a
 * repair, or not being clean. A clean room with only its daily stayover service does not.
 */
export function needsAction(r: HousekeepingRoom): boolean {
  return (
    r.urgent ||
    r.room.status !== 'clean' ||
    r.occupancy === 'arriving' ||
    r.occupancy === 'turnover' ||
    r.occupancy === 'departing' ||
    r.openTasks.some((t) => t.type !== 'stayover')
  );
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

export const effortLabels: Record<CleaningEffort, string> = {
  light: 'Light clean',
  standard: 'Standard clean',
  heavy: 'Heavy clean',
};

/** Bars lit on a card's effort meter, out of three. */
export const effortBars: Record<CleaningEffort, number> = { light: 1, standard: 2, heavy: 3 };

/** "Heavy clean: Dog, 2 kids" */
export function effortSummary(effort: CleaningEffort, cues: string[]): string {
  return cues.length > 0 ? `${effortLabels[effort]}: ${cues.join(', ')}` : effortLabels[effort];
}

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
