import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { HousekeepingRoom, HousekeepingTask, RoomStatus } from '@orbit/shared';
import { Keyboard, Mic } from 'lucide-react';
import { useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { HousekeepingNoteDialog, type NoteMode } from '@/components/housekeeping-note-dialog';
import { HousekeepingRoomCard } from '@/components/housekeeping-room-card';
import { PageHeader } from '@/components/page-header';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHealth, useHousekeeping, useSetRoomStatus, useSetTaskStatus } from '@/lib/api';
import { formatLongDate } from '@/lib/format';
import { boardColumns } from '@/lib/housekeeping';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';
import { cn } from '@/lib/utils';

export function HousekeepingPage() {
  const board = useHousekeeping();
  const health = useHealth();
  const setStatus = useSetRoomStatus();
  const setTask = useSetTaskStatus();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteMode, setNoteMode] = useState<NoteMode>('voice');
  const aiOn = health.data?.ai.configured ?? false;
  const voiceOn = health.data?.ai.voice ?? false;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // On phones a short press starts the drag, so the board still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function openNote(mode: NoteMode) {
    setNoteMode(mode);
    setNoteOpen(true);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const item = board.data?.rooms.find((r) => r.room.id === active.id);
    const status = over?.id as RoomStatus | undefined;
    if (item && status && status !== item.room.status) {
      setStatus.mutate({ roomId: item.room.id, status });
    }
  }

  const completeTask = (task: HousekeepingTask) => setTask.mutate({ id: task.id, status: 'done' });
  const error = setStatus.error ?? setTask.error;

  return (
    <>
      <PageHeader
        title="Housekeeping"
        meta={board.data && formatLongDate(board.data.date)}
        actions={
          aiOn && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Type a note"
                onClick={() => openNote('text')}
              >
                <Keyboard /> <span className="hidden sm:inline">Type a note</span>
              </Button>
              {voiceOn && (
                <Button size="sm" onClick={() => openNote('voice')}>
                  <Mic /> Voice note
                </Button>
              )}
            </>
          )
        }
      />

      {error && (
        <ErrorNotice
          message={error.message}
          className="mx-3 mt-3"
          onDismiss={() => {
            setStatus.reset();
            setTask.reset();
          }}
        />
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
        {board.isError ? (
          <ErrorNotice message={board.error.message} />
        ) : !board.data ? (
          <div className="grid gap-3 lg:grid-cols-4">
            {boardColumns.map((c) => (
              <Skeleton key={c} className="h-80" />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="flex h-full snap-x gap-3 lg:grid lg:grid-cols-4">
              {boardColumns.map((status) => (
                <Column
                  key={status}
                  status={status}
                  rooms={board.data.rooms.filter((r) => r.room.status === status)}
                  busyRoomId={setStatus.isPending ? setStatus.variables.roomId : null}
                  onCompleteTask={completeTask}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      <HousekeepingNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        mode={noteMode}
        onModeChange={setNoteMode}
        voiceAvailable={voiceOn}
      />
    </>
  );
}

function Column({
  status,
  rooms,
  busyRoomId,
  onCompleteTask,
}: {
  status: RoomStatus;
  rooms: HousekeepingRoom[];
  busyRoomId: string | null;
  onCompleteTask: (task: HousekeepingTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={roomStatusLabels[status]}
      className={cn(
        'flex w-[17rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-surface-sunken p-2 lg:w-auto',
        isOver && 'bg-primary-soft ring-1 ring-primary/30',
      )}
    >
      <h2 className="flex items-center gap-2 px-1 pt-1 text-sm font-medium">
        <StatusDot className={roomStatusColor[status]} />
        {roomStatusLabels[status]}
        <span className="text-subtle-foreground tabular-nums">{rooms.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {rooms.map((item) => (
          <DraggableCard
            key={item.room.id}
            item={item}
            busy={busyRoomId === item.room.id}
            onCompleteTask={onCompleteTask}
          />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({
  item,
  busy,
  onCompleteTask,
}: {
  item: HousekeepingRoom;
  busy: boolean;
  onCompleteTask: (task: HousekeepingTask) => void;
}) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: item.room.id,
    disabled: busy,
  });
  return (
    <HousekeepingRoomCard
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      item={item}
      busy={busy}
      dragging={isDragging}
      onCompleteTask={onCompleteTask}
      className="cursor-grab touch-manipulation active:cursor-grabbing"
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
    />
  );
}
