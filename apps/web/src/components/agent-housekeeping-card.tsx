import type {
  AgentRoomStatusResult,
  AgentTaskCreatedResult,
  AgentTaskStatusResult,
} from '@orbit/shared';
import { ArrowRight, BrushCleaning, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AgentCard, AgentCardHeader } from '@/components/agent-card';
import { RoomBadge } from '@/components/agent-mention';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useSetRoomStatus, useSetTaskStatus } from '@/lib/api';
import { taskLabel, taskStatusLabels } from '@/lib/housekeeping';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';

/** A housekeeping change the agent made straight away, without a confirm card. */
export type HousekeepingChangeResult =
  | { kind: 'room_status'; key: string; result: AgentRoomStatusResult }
  | { kind: 'task_created'; key: string; result: AgentTaskCreatedResult }
  | { kind: 'task_status'; key: string; result: AgentTaskStatusResult };

/**
 * What the agent changed in housekeeping, one row per change, so a change made without asking is
 * still in view. Status changes can be set back from here, by the staff member, like on the board.
 */
export function HousekeepingCard({ changes }: { changes: HousekeepingChangeResult[] }) {
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  return (
    <AgentCard>
      <AgentCardHeader
        icon={BrushCleaning}
        title="Housekeeping updated"
        aside={
          <Button
            variant="ghost"
            size="xs"
            className="-my-1 shrink-0"
            onClick={() => {
              closePalette();
              void navigate('/housekeeping');
            }}
          >
            Open housekeeping
          </Button>
        }
      />
      <ul className="flex flex-col gap-1">
        {changes.map((c) =>
          c.kind === 'room_status' ? (
            <RoomStatusRow key={c.key} result={c.result} />
          ) : c.kind === 'task_status' ? (
            <TaskStatusRow key={c.key} result={c.result} />
          ) : (
            <Row key={c.key} room={c.result.roomName} change="New task">
              {taskLabel(c.result.task)}
            </Row>
          ),
        )}
      </ul>
    </AgentCard>
  );
}

function Row({
  room,
  children,
  change,
  undo,
}: {
  room: string;
  children: ReactNode;
  change: ReactNode;
  undo?: ReactNode;
}) {
  return (
    <li className="flex min-h-7 items-center gap-2.5">
      <RoomBadge name={room} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {change}
      </span>
      {undo}
    </li>
  );
}

/** "Set back to dirty", then what happened when it ran. */
function SetBack({
  label,
  run,
  state,
}: {
  label: string;
  run: () => void;
  state: { isPending: boolean; isSuccess: boolean; error: Error | null };
}) {
  if (state.isSuccess) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5" /> Set back
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      {state.error && (
        <span className="max-w-48 truncate text-xs text-destructive" title={state.error.message}>
          {state.error.message}
        </span>
      )}
      <Button variant="ghost" size="xs" disabled={state.isPending} onClick={run}>
        Set back to {label.toLowerCase()}
      </Button>
    </span>
  );
}

function RoomStatusRow({ result }: { result: AgentRoomStatusResult }) {
  const setStatus = useSetRoomStatus();
  return (
    <Row
      room={result.roomName}
      change={
        <>
          <StatusDot className={roomStatusColor[result.from]} />
          {roomStatusLabels[result.from]}
          <ArrowRight className="size-3" />
          <StatusDot className={roomStatusColor[result.status]} />
          <span className="text-foreground">{roomStatusLabels[result.status]}</span>
        </>
      }
      undo={
        result.from !== result.status && (
          <SetBack
            label={roomStatusLabels[result.from]}
            run={() => setStatus.mutate({ roomId: result.roomId, status: result.from })}
            state={setStatus}
          />
        )
      }
    >
      Room status
    </Row>
  );
}

function TaskStatusRow({ result }: { result: AgentTaskStatusResult }) {
  const setStatus = useSetTaskStatus();
  return (
    <Row
      room={result.roomName}
      change={
        <>
          {taskStatusLabels[result.from]}
          <ArrowRight className="size-3" />
          <span className="text-foreground">{taskStatusLabels[result.task.status]}</span>
        </>
      }
      undo={
        result.from !== result.task.status && (
          <SetBack
            label={taskStatusLabels[result.from]}
            run={() => setStatus.mutate({ id: result.task.id, status: result.from })}
            state={setStatus}
          />
        )
      }
    >
      {taskLabel(result.task)}
    </Row>
  );
}
