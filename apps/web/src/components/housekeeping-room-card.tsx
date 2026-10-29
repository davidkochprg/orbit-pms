import {
  type HousekeepingRoom,
  type HousekeepingTask,
  type RoomOccupancy,
  type RoomStatus,
  roomStatuses,
} from '@orbit/shared';
import {
  ArrowLeftRight,
  BedDouble,
  Check,
  LogIn,
  LogOut,
  type LucideIcon,
  MoreHorizontal,
  Plus,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { ComponentProps, PointerEvent } from 'react';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { nextRoomStep, occupancyLabels, taskLabel } from '@/lib/housekeeping';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';
import { cn } from '@/lib/utils';

const occupancyIcons: Record<RoomOccupancy, LucideIcon | null> = {
  turnover: ArrowLeftRight,
  arriving: LogIn,
  departing: LogOut,
  staying: BedDouble,
  vacant: null,
};

interface RoomCardProps extends ComponentProps<'div'> {
  item: HousekeepingRoom;
  onCompleteTask: (task: HousekeepingTask) => void;
  /** Sets the room's status, from its button or menu; without it the card has no actions. */
  onSetStatus?: (status: RoomStatus) => void;
  onAddTask?: () => void;
  busy?: boolean;
  dragging?: boolean;
}

// A tap on a button inside the card must not start dragging the card.
const noDrag = { onPointerDown: (e: PointerEvent) => e.stopPropagation() };

/**
 * A room on the housekeeping board: today's situation, what still needs doing, and a button for
 * its usual next step (e.g. "Mark clean") with the other statuses in its menu.
 */
export function HousekeepingRoomCard({
  item,
  onCompleteTask,
  onSetStatus,
  onAddTask,
  busy,
  dragging,
  className,
  ...props
}: RoomCardProps) {
  const { room, roomTypeName, occupancy, guestName, urgent, openTasks } = item;
  const Icon = occupancyIcons[occupancy];
  const next = nextRoomStep(room.status);
  return (
    <div
      {...props}
      className={cn(
        'relative flex flex-col gap-2 rounded-stage bg-background p-3 shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit outline-none',
        urgent && 'ring-1 ring-warning/60',
        busy && 'opacity-60',
        dragging && 'z-30 shadow-floating',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[0.9375rem] font-medium">{room.name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {roomTypeName}
        </span>
        {onSetStatus && (
          <span className="-my-1 -mr-1 flex shrink-0 items-center gap-0.5">
            {next && (
              <Button
                variant="outline"
                size="xs"
                disabled={busy}
                {...noDrag}
                onClick={() => onSetStatus(next.status)}
              >
                <StatusDot className={roomStatusColor[next.status]} />
                {next.label}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`More for room ${room.name}`}
                  disabled={busy}
                  {...noDrag}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {roomStatuses
                  // A repaired room is cleaned before it can be clean or inspected again.
                  .filter(
                    (s) =>
                      s !== room.status &&
                      s !== next?.status &&
                      !(room.status === 'out_of_order' && (s === 'clean' || s === 'inspected')),
                  )
                  .map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => onSetStatus(s)}>
                      <StatusDot className={roomStatusColor[s]} />
                      Mark {roomStatusLabels[s].toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                {onAddTask && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onAddTask}>
                      <Plus /> Add task…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </div>

      {(occupancy !== 'vacant' || urgent) && (
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {Icon && <Icon className="size-3.5" />}
            {occupancyLabels[occupancy]}
            {guestName && <span className="truncate text-foreground">{guestName}</span>}
          </span>
          {urgent && (
            <span className="font-medium text-warning">Guest arrives today, not inspected yet</span>
          )}
        </div>
      )}

      {openTasks.length > 0 && (
        <ul className="flex flex-col gap-1 border-t pt-2">
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2 text-xs">
              <button
                type="button"
                aria-label={`Mark done: ${taskLabel(task)}`}
                // Keep a tap on the checkbox from starting a drag.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onCompleteTask(task)}
                className="group/check mt-px flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-background hover:border-primary"
              >
                <Check className="size-2.5 text-primary opacity-0 group-hover/check:opacity-100" />
              </button>
              {task.type === 'maintenance' ? (
                <Wrench className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Sparkles className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 leading-snug">{taskLabel(task)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
