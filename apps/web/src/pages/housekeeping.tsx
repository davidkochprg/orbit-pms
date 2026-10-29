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
import {
  type HousekeepingRoom,
  type HousekeepingTask,
  type RoomStatus,
  roomStatuses,
} from '@orbit/shared';
import { CalendarRange, Keyboard, Mic, Plus } from 'lucide-react';
import { type ComponentProps, type ReactElement, type Ref, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { HousekeepingNoteDialog, type NoteMode } from '@/components/housekeeping-note-dialog';
import { HousekeepingRoomCard } from '@/components/housekeeping-room-card';
import { PageHeader } from '@/components/page-header';
import { Count } from '@/components/panel';
import { StatusDot } from '@/components/status-dot';
import { TaskDialog } from '@/components/task-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
  // Undefined: closed. A room ID or null: open, with or without a room chosen.
  const [taskRoom, setTaskRoom] = useState<string | null | undefined>(undefined);
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
          <>
            <Button
              variant="outline"
              size="sm"
              aria-label="New task"
              onClick={() => setTaskRoom(null)}
            >
              <Plus /> <span className="hidden sm:inline">New task</span>
            </Button>
            {aiOn && (
              <>
                <Button
                  variant="outline"
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
            )}
          </>
        }
      />

      {error && (
        <ErrorNotice
          message={error.message}
          className="mx-4 mt-4 md:mx-6"
          onDismiss={() => {
            setStatus.reset();
            setTask.reset();
          }}
        />
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-4 py-6 md:px-6">
        {board.isError ? (
          <ErrorNotice message={board.error.message} />
        ) : !board.data ? (
          <div className="grid gap-3 lg:grid-cols-4">
            {boardColumns.map((c) => (
              <Skeleton key={c} className="h-80 rounded-card" />
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
                  onSetStatus={(roomId, s) => setStatus.mutate({ roomId, status: s })}
                  onAddTask={setTaskRoom}
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
      <TaskDialog
        open={taskRoom !== undefined}
        onOpenChange={(open) => !open && setTaskRoom(undefined)}
        roomId={taskRoom ?? undefined}
      />
    </>
  );
}

function Column({
  status,
  rooms,
  busyRoomId,
  onCompleteTask,
  onSetStatus,
  onAddTask,
}: {
  status: RoomStatus;
  rooms: HousekeepingRoom[];
  busyRoomId: string | null;
  onCompleteTask: (task: HousekeepingTask) => void;
  onSetStatus: (roomId: string, status: RoomStatus) => void;
  onAddTask: (roomId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={roomStatusLabels[status]}
      className="flex w-[17rem] shrink-0 snap-start flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset lg:w-auto"
    >
      <h2 className="flex h-9 items-center gap-2 px-3 text-[0.8125rem] text-muted-foreground">
        <StatusDot className={roomStatusColor[status]} />
        {roomStatusLabels[status]}
        <Count value={rooms.length} />
      </h2>
      <div
        className={cn(
          'flex flex-1 flex-col gap-1 rounded-stage transition-colors duration-150 ease-snap',
          isOver && 'bg-primary-soft',
        )}
      >
        {rooms.map((item) => (
          <RoomContextMenu
            key={item.room.id}
            item={item}
            onSetStatus={onSetStatus}
            onAddTask={onAddTask}
          >
            <DraggableCard
              item={item}
              busy={busyRoomId === item.room.id}
              onCompleteTask={onCompleteTask}
              onSetStatus={(s) => onSetStatus(item.room.id, s)}
              onAddTask={() => onAddTask(item.room.id)}
            />
          </RoomContextMenu>
        ))}
      </div>
    </section>
  );
}

function DraggableCard({
  item,
  busy,
  onCompleteTask,
  onSetStatus,
  onAddTask,
  ref,
  ...rest
}: Omit<ComponentProps<'div'>, 'ref'> & {
  item: HousekeepingRoom;
  busy: boolean;
  onCompleteTask: (task: HousekeepingTask) => void;
  onSetStatus: (status: RoomStatus) => void;
  onAddTask: () => void;
  /** From a wrapping trigger, e.g. the room's context menu. */
  ref?: Ref<HTMLDivElement>;
}) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: item.room.id,
    disabled: busy,
  });
  return (
    <HousekeepingRoomCard
      {...rest}
      ref={(node) => {
        setNodeRef(node);
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      {...listeners}
      {...attributes}
      item={item}
      busy={busy}
      dragging={isDragging}
      onCompleteTask={onCompleteTask}
      onSetStatus={onSetStatus}
      onAddTask={onAddTask}
      className="cursor-grab touch-manipulation active:cursor-grabbing"
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
    />
  );
}

/** Right-click a room: set its status without dragging, or add a task. */
function RoomContextMenu({
  item,
  onSetStatus,
  onAddTask,
  children,
}: {
  item: HousekeepingRoom;
  onSetStatus: (roomId: string, status: RoomStatus) => void;
  onAddTask: (roomId: string) => void;
  children: ReactElement;
}) {
  const navigate = useNavigate();
  const { room } = item;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Room {room.name}</ContextMenuLabel>
        {roomStatuses
          .filter((s) => s !== room.status)
          .map((s) => (
            <ContextMenuItem key={s} onSelect={() => onSetStatus(room.id, s)}>
              <StatusDot className={roomStatusColor[s]} />
              Mark {roomStatusLabels[s].toLowerCase()}
            </ContextMenuItem>
          ))}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onAddTask(room.id)}>
          <Plus /> Add task…
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void navigate('/tape-chart')}>
          <CalendarRange /> Open tape chart
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
