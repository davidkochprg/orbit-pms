import type { RoomStatus } from '@orbit/shared';
import { StatusDot } from '@/components/status-dot';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';

export function RoomStatusDot({ status }: { status: RoomStatus }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex p-1" aria-label={roomStatusLabels[status]} role="img">
          <StatusDot className={roomStatusColor[status]} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{roomStatusLabels[status]}</TooltipContent>
    </Tooltip>
  );
}
