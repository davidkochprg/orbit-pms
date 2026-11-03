import {
  canChangeRoomStatus,
  type HousekeepingRoom,
  type RoomStatus,
  roomStatuses,
} from '@orbit/shared';
import { CalendarRange, Plus } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '@/components/logo-mark';
import { StatusDot } from '@/components/status-dot';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useAskOrbit } from '@/hooks/use-ask-orbit';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';

/** A room's right-click menu: its other statuses, a task, the tape chart and the agent. */
export function RoomContextMenu({
  item,
  onSetStatus,
  onAddTask,
  first,
  children,
}: {
  item: HousekeepingRoom;
  onSetStatus: (roomId: string, status: RoomStatus) => void;
  onAddTask: (roomId: string) => void;
  /** Items above the statuses, e.g. opening the room's stay. */
  first?: ReactNode;
  children: ReactElement;
}) {
  const navigate = useNavigate();
  const ask = useAskOrbit();
  const { room } = item;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Room {room.name}</ContextMenuLabel>
        {first && (
          <>
            {first}
            <ContextMenuSeparator />
          </>
        )}
        {roomStatuses
          .filter((s) => s !== room.status && canChangeRoomStatus(room.status, s))
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
        {ask && (
          <ContextMenuItem onSelect={() => ask({ kind: 'room', id: room.id })}>
            <LogoMark /> Ask Orbit
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
