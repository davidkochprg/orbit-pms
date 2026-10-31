import type { HousekeepingTaskType } from '@orbit/shared';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateTask, useRooms } from '@/lib/api';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the room, e.g. when opened from a room card. */
  roomId?: string;
}

const taskTypes: { value: HousekeepingTaskType; label: string }[] = [
  { value: 'maintenance', label: 'Repair' },
  { value: 'turnover', label: 'Turnover' },
  { value: 'stayover', label: 'Stayover' },
];

/** Adds a housekeeping task by hand: a repair, or a cleaning the board doesn't show yet. */
export function TaskDialog({ open, onOpenChange, roomId }: TaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-md">
        {open && <TaskForm roomId={roomId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({ roomId, onDone }: { roomId: string | undefined; onDone: () => void }) {
  const rooms = useRooms();
  const create = useCreateTask();
  const [room, setRoom] = useState(roomId ?? '');
  const [type, setType] = useState<HousekeepingTaskType>('maintenance');
  const [notes, setNotes] = useState('');
  const needsNotes = type === 'maintenance';

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ roomId: room, type, notes: notes.trim() || null }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
      </DialogHeader>
      <FormField label="Room" htmlFor="task-room">
        <Select id="task-room" value={room} onValueChange={(value) => setRoom(value)}>
          <option value="" disabled>
            Choose a room
          </option>
          {rooms.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </FormField>
      <Segmented label="Task type" value={type} options={taskTypes} onChange={setType} />
      <FormField label={needsNotes ? 'What needs fixing' : 'Notes'} htmlFor="task-notes">
        <Textarea
          id="task-notes"
          rows={3}
          required={needsNotes}
          placeholder={needsNotes ? 'e.g. Bathroom tap is dripping' : 'Optional'}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
      {create.error && <ErrorNotice message={create.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!room || (needsNotes && !notes.trim()) || create.isPending}>
          Add task
        </Button>
      </DialogFooter>
    </form>
  );
}
