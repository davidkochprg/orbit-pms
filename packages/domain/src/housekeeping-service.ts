import type {
  AuditActor,
  HousekeepingBoard,
  HousekeepingChange,
  HousekeepingNoteReading,
  HousekeepingNoteResult,
  HousekeepingTask,
  HousekeepingTaskStatus,
  HousekeepingTaskType,
  IsoDate,
  Room,
  RoomStatus,
  StayReading,
} from '@orbit/shared';
import { normalizeStayReading, staySource } from './cleaning-effort';
import { addDays, hotelToday } from './dates';
import { DomainError } from './errors';
import {
  boardStays,
  buildHousekeepingBoard,
  canChangeRoomStatus,
  completedByStatus,
  noteChangesStatus,
  resolveRoom,
} from './housekeeping';
import type { Repositories } from './repositories';

export interface HousekeepingDeps {
  repos: Repositories;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/** A stay's text for the model to read for housekeeping. */
export interface StayToRead {
  bookingId: string;
  source: string;
}

export interface NewTask {
  roomId: string;
  type: HousekeepingTaskType;
  notes: string | null;
}

const roomStatusLabels: Record<RoomStatus, string> = {
  clean: 'clean',
  dirty: 'dirty',
  inspected: 'inspected',
  out_of_order: 'out of order',
};

/** Room status and housekeeping tasks. Every change is written to the audit log. */
export function createHousekeepingService({ repos, clock, newId }: HousekeepingDeps) {
  async function loadRoom(tx: Repositories, id: string): Promise<Room> {
    const room = await tx.rooms.getRoom(id);
    if (!room) throw new DomainError('not_found', `Room ${id} not found`);
    return room;
  }

  /** Sets the status and completes cleaning tasks it makes redundant. Returns the old status. */
  async function changeStatus(
    tx: Repositories,
    room: Room,
    status: RoomStatus,
    actor: AuditActor,
  ): Promise<RoomStatus> {
    if (!canChangeRoomStatus(room.status, status)) {
      throw new DomainError(
        'invalid_transition',
        `Room ${room.name} is out of order; mark it dirty for cleaning before it can be ${roomStatusLabels[status]}`,
      );
    }
    await tx.rooms.setRoomStatus(room.id, status);
    for (const task of await tx.housekeeping.listTasks({ roomId: room.id })) {
      if (completedByStatus(status, task))
        await tx.housekeeping.updateTask({ ...task, status: 'done' });
    }
    await tx.audit.append({
      actor,
      action: 'room.status',
      subjectId: room.id,
      payload: { from: room.status, to: status },
    });
    return room.status;
  }

  async function addTask(tx: Repositories, input: NewTask, actor: AuditActor) {
    const task: HousekeepingTask = {
      id: newId('hk'),
      roomId: input.roomId,
      type: input.type,
      status: 'open',
      notes: input.notes?.trim() || null,
      createdAt: clock().toISOString(),
    };
    await tx.housekeeping.createTask(task);
    await tx.audit.append({ actor, action: 'task.create', subjectId: task.roomId, payload: task });
    return task;
  }

  /** The board's data for `date`, with each stay's text and whether the model has read it. */
  async function loadDay(date: IsoDate) {
    const [rooms, roomTypes, bookings, guests, tasks, inquiries] = await Promise.all([
      repos.rooms.listRooms(),
      repos.rooms.listRoomTypes(),
      // From the day before, so stays that leave on `date` are included.
      repos.bookings.listBookings({ from: addDays(date, -1), to: addDays(date, 1) }),
      repos.guests.listGuests(),
      repos.housekeeping.listTasks({ status: ['open', 'in_progress'] }),
      repos.inquiries.listInquiries(),
    ]);
    const stays = boardStays(rooms, bookings, date);
    const readings = await repos.stayReadings.list(stays.map((b) => b.id));
    const unread: StayToRead[] = stays
      .map((b) => ({
        bookingId: b.id,
        source: staySource(
          b,
          guests.find((g) => g.id === b.guestId),
          inquiries,
        ),
      }))
      .filter(
        ({ bookingId, source }) =>
          source !== '' && readings.find((r) => r.bookingId === bookingId)?.source !== source,
      );
    return { rooms, roomTypes, bookings, guests, tasks, readings, unread };
  }

  return {
    async board(date: IsoDate = hotelToday(clock())): Promise<HousekeepingBoard> {
      const { unread, ...day } = await loadDay(date);
      return {
        date,
        // A reading of an older text still counts until the new one is read.
        rooms: buildHousekeepingBoard({ ...day, date }),
        unreadStays: unread.length,
      };
    },

    /** Stays on the board whose notes or messages changed since the model last read them. */
    async staysToRead(date: IsoDate = hotelToday(clock())): Promise<StayToRead[]> {
      return (await loadDay(date)).unread;
    },

    /**
     * Keeps what the model read from each stay's text. A stay the model skipped is saved as
     * nothing unusual, so the same text is not sent again.
     */
    async saveStayReadings(stays: StayToRead[], readings: StayReading[]): Promise<void> {
      const readAt = clock().toISOString();
      for (const { bookingId, source } of stays) {
        const read = readings.find((r) => r.bookingId === bookingId) ?? {
          bookingId,
          pets: false,
          mess: 'usual' as const,
          messReason: null,
          prepare: [],
        };
        await repos.stayReadings.save({ ...normalizeStayReading(read), source, readAt });
      }
    },

    setRoomStatus(roomId: string, status: RoomStatus, actor: AuditActor): Promise<Room> {
      return repos.transaction(async (tx) => {
        const room = await loadRoom(tx, roomId);
        if (room.status !== status) await changeStatus(tx, room, status, actor);
        return { ...room, status };
      });
    },

    createTask(input: NewTask, actor: AuditActor): Promise<HousekeepingTask> {
      return repos.transaction(async (tx) => {
        await loadRoom(tx, input.roomId);
        if (input.type === 'maintenance' && !input.notes?.trim()) {
          throw new DomainError('invalid_input', 'Describe what needs fixing');
        }
        return addTask(tx, input, actor);
      });
    },

    async getTask(id: string): Promise<HousekeepingTask> {
      const task = await repos.housekeeping.getTask(id);
      if (!task) throw new DomainError('not_found', `Task ${id} not found`);
      return task;
    },

    setTaskStatus(
      id: string,
      status: HousekeepingTaskStatus,
      actor: AuditActor,
    ): Promise<HousekeepingTask> {
      return repos.transaction(async (tx) => {
        const task = await tx.housekeeping.getTask(id);
        if (!task) throw new DomainError('not_found', `Task ${id} not found`);
        const updated = { ...task, status };
        await tx.housekeeping.updateTask(updated);
        await tx.audit.append({
          actor,
          action: 'task.status',
          subjectId: task.roomId,
          payload: { taskId: id, from: task.status, to: status },
        });
        return updated;
      });
    },

    /**
     * Applies what a housekeeping note says, all at once. Room names are matched here, not by the
     * model; updates that name no known room or break a rule are skipped with a reason.
     */
    applyNote(
      reading: HousekeepingNoteReading,
      transcript: string,
      actor: AuditActor,
    ): Promise<HousekeepingNoteResult> {
      return repos.transaction(async (tx) => {
        const rooms = await tx.rooms.listRooms();
        const changes: HousekeepingChange[] = [];
        const skipped: HousekeepingNoteResult['skipped'] = [];
        for (const update of reading.updates) {
          const found = resolveRoom(rooms, update.room);
          if (!found) {
            skipped.push({ room: update.room, reason: `No room called "${update.room}"` });
            continue;
          }
          // Re-read: an earlier update in the same note may have changed it.
          const room = await loadRoom(tx, found.id);
          if (update.status && noteChangesStatus(room.status, update.status)) {
            if (canChangeRoomStatus(room.status, update.status)) {
              const from = await changeStatus(tx, room, update.status, actor);
              changes.push({
                kind: 'room_status',
                roomId: room.id,
                roomName: room.name,
                from,
                to: update.status,
              });
            } else {
              skipped.push({
                room: room.name,
                reason: `Room ${room.name} is out of order, so it can't be ${roomStatusLabels[update.status]} yet`,
              });
            }
          }
          if (update.issue?.trim()) {
            const task = await addTask(
              tx,
              { roomId: room.id, type: 'maintenance', notes: update.issue },
              actor,
            );
            changes.push({ kind: 'task_created', roomName: room.name, task });
          }
        }
        return { transcript, changes, skipped, unclear: reading.unclear };
      });
    },
  };
}

export type HousekeepingService = ReturnType<typeof createHousekeepingService>;
