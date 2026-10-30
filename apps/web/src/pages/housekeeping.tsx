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
import { type ComponentProps, type ReactElement, type Ref, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { HousekeepingNoteDialog, type NoteMode } from '@/components/housekeeping-note-dialog';
import { HousekeepingRoomCard } from '@/components/housekeeping-room-card';
import { PageHeader } from '@/components/page-header';
import { RepairDialog } from '@/components/repair-panel';
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
import { useToast } from '@/hooks/use-toast';
import {
  useHealth,
  useHousekeeping,
  useReadStays,
  useSetRoomStatus,
  useSetTaskStatus,
  useContacts,
} from '@/lib/api';
import { formatLongDate } from '@/lib/format';
import { boardColumns, needsAction, taskLabel } from '@/lib/housekeeping';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';
import { cn } from '@/lib/utils';

export function HousekeepingPage() {
  const board = useHousekeeping();
  const health = useHealth();
  const setStatus = useSetRoomStatus();
  const setTask = useSetTaskStatus();
  const { toast } = useToast();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteMode, setNoteMode] = useState<NoteMode>('voice');
  // Undefined: closed. A room ID or null: open, with or without a room chosen.
  const [taskRoom, setTaskRoom] = useState<string | null | undefined>(undefined);
  const [repairTask, setRepairTask] = useState<string | null>(null);
  const contacts = useContacts();
  const repairs: RepairLinks = {
    open: (task) => setRepairTask(task.id),
    names: new Map(contacts.data?.map((c) => [c.id, c.name])),
  };
  const aiOn = health.data?.ai.configured ?? false;
  const voiceOn = health.data?.ai.voice ?? false;
  const { mutate: readStays, isPending: readingStays, isError: readStaysFailed } = useReadStays();
  const unreadStays = board.data?.unreadStays ?? 0;
  // Stays whose notes changed are read in the background, a batch at a time; the board re-ranks
  // when they are. A failure (e.g. the demo limit) stops it until the page is opened again.
  useEffect(() => {
    if (aiOn && unreadStays > 0 && !readingStays && !readStaysFailed) readStays();
  }, [aiOn, unreadStays, readingStays, readStaysFailed, readStays]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // On phones a short press starts the drag, so the board still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function openNote(mode: NoteMode) {
    setNoteMode(mode);
    setNoteOpen(true);
  }

  /** Sets a room's status and says so, with Undo back to what it was. */
  function changeStatus(roomId: string, status: RoomStatus) {
    const item = board.data?.rooms.find((r) => r.room.id === roomId);
    if (!item || status === item.room.status) return;
    const from = item.room.status;
    // Marking a room clean or inspected completes its cleaning tasks; Undo opens them again.
    const completes = item.openTasks.filter(
      (t) =>
        (status === 'clean' || status === 'inspected') &&
        (t.type === 'turnover' || t.type === 'stayover'),
    );
    setStatus.mutate(
      { roomId, status },
      {
        onSuccess: () =>
          toast({
            title: `Room ${item.room.name} marked ${roomStatusLabels[status].toLowerCase()}`,
            action: {
              label: 'Undo',
              run: () =>
                setStatus.mutate(
                  { roomId, status: from },
                  {
                    onSuccess: () => {
                      for (const t of completes) setTask.mutate({ id: t.id, status: t.status });
                    },
                  },
                ),
            },
          }),
      },
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const status = over?.id as RoomStatus | undefined;
    if (status) changeStatus(String(active.id), status);
  }

  const completeTask = (task: HousekeepingTask) =>
    setTask.mutate(
      { id: task.id, status: 'done' },
      {
        onSuccess: () => {
          const room = board.data?.rooms.find((r) => r.room.id === task.roomId)?.room.name;
          toast({
            title: `${taskLabel(task)} done${room ? ` in ${room}` : ''}`,
            action: {
              label: 'Undo',
              run: () => setTask.mutate({ id: task.id, status: task.status }),
            },
          });
        },
      },
    );
  const error = setStatus.error ?? setTask.error;

  return (
    <>
      <PageHeader
        title="Housekeeping"
        meta={
          board.data && (
            <>
              {formatLongDate(board.data.date)}
              {readingStays && (
                <span className="text-subtle-foreground"> · Reading guest notes…</span>
              )}
            </>
          )
        }
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
            {/* An empty out-of-order column only needs to be a drop target, not a quarter of the page. */}
            <div
              className={cn(
                'flex h-full snap-x gap-3 lg:grid',
                board.data.rooms.some((r) => r.room.status === 'out_of_order')
                  ? 'lg:grid-cols-4'
                  : 'lg:grid-cols-[1fr_1fr_1fr_11rem]',
              )}
            >
              {boardColumns.map((status) => (
                <Column
                  key={status}
                  status={status}
                  rooms={sortForAction(board.data.rooms.filter((r) => r.room.status === status))}
                  busyRoomId={setStatus.isPending ? setStatus.variables.roomId : null}
                  onCompleteTask={completeTask}
                  onSetStatus={changeStatus}
                  onAddTask={setTaskRoom}
                  repairs={repairs}
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
      <RepairDialog taskId={repairTask} onOpenChange={(open) => !open && setRepairTask(null)} />
    </>
  );
}

/** Opens who can fix a repair, and names whoever was asked. */
interface RepairLinks {
  open: (task: HousekeepingTask) => void;
  names: Map<string, string>;
}

/** Rooms someone has to see to today first, routine stayovers after; the board's order within. */
function sortForAction(rooms: HousekeepingRoom[]): HousekeepingRoom[] {
  return [...rooms.filter(needsAction), ...rooms.filter((r) => !needsAction(r))];
}

function Column({
  status,
  rooms,
  busyRoomId,
  onCompleteTask,
  onSetStatus,
  onAddTask,
  repairs,
}: {
  status: RoomStatus;
  rooms: HousekeepingRoom[];
  busyRoomId: string | null;
  onCompleteTask: (task: HousekeepingTask) => void;
  onSetStatus: (roomId: string, status: RoomStatus) => void;
  onAddTask: (roomId: string) => void;
  repairs: RepairLinks;
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
        {rooms.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-subtle-foreground">
            {status === 'out_of_order' ? 'No rooms out of order' : 'None'}
          </p>
        )}
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
              onOpenRepair={repairs.open}
              contactNames={repairs.names}
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
  onOpenRepair: (task: HousekeepingTask) => void;
  contactNames: Map<string, string>;
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
