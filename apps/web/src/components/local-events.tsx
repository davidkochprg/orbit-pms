import { type EventImpact, eventImpacts, type LocalEvent } from '@orbit/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCreateEvent, useDeleteEvent } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { impactLabels } from '@/lib/revenue';
import { cn } from '@/lib/utils';

const impactTone: Record<EventImpact, string> = {
  low: 'bg-ink/5 text-muted-foreground',
  medium: 'bg-accent-peach/25 text-foreground',
  high: 'bg-accent-peach/60 text-foreground',
};

/** Events in the area behind suggested rates; a manager adds and removes them. */
export function LocalEvents({
  events,
  canManage,
  today,
}: {
  events: LocalEvent[];
  canManage: boolean;
  today: string;
}) {
  const create = useCreateEvent();
  const remove = useDeleteEvent();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [firstNight, setFirstNight] = useState(today);
  const [lastNight, setLastNight] = useState(today);
  const [impact, setImpact] = useState<EventImpact>('medium');
  const error = create.error ?? remove.error;

  return (
    <div className="flex flex-col">
      {events.length === 0 && !adding && (
        <p className="px-3 py-6 text-center text-xs text-subtle-foreground">
          No events in the coming nights
        </p>
      )}
      <ul className="flex flex-col">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 border-b border-ink/5 px-3 py-2 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.8125rem]">{e.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(e.firstNight)}
                {e.lastNight !== e.firstNight && ` – ${formatDate(e.lastNight)}`}
              </span>
            </span>
            <span
              className={cn(
                'rounded-[5px] px-1.5 text-[0.6875rem] leading-5',
                impactTone[e.impact],
              )}
            >
              {impactLabels[e.impact]}
            </span>
            {canManage && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${e.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(e.id)}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <ErrorNotice message={error.message} className="m-2" />}
      {canManage &&
        (adding ? (
          <form
            className="grid grid-cols-2 gap-2 border-t border-ink/5 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { name, firstNight, lastNight, impact },
                {
                  onSuccess: () => {
                    setAdding(false);
                    setName('');
                  },
                },
              );
            }}
          >
            <Input
              aria-label="Event name"
              placeholder="e.g. Trail race"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-2 h-8 text-[0.8125rem]"
              autoFocus
            />
            <Input
              type="date"
              aria-label="First night"
              value={firstNight}
              min={today}
              onChange={(e) => {
                setFirstNight(e.target.value);
                if (lastNight < e.target.value) setLastNight(e.target.value);
              }}
              className="h-8 text-[0.8125rem]"
            />
            <Input
              type="date"
              aria-label="Last night"
              value={lastNight}
              min={firstNight}
              onChange={(e) => setLastNight(e.target.value)}
              className="h-8 text-[0.8125rem]"
            />
            <NativeSelect
              aria-label="How much it brings"
              value={impact}
              onChange={(e) => setImpact(e.target.value as EventImpact)}
              className="h-8 text-[0.8125rem]"
            >
              {eventImpacts.map((i) => (
                <option key={i} value={i}>
                  {impactLabels[i]} event
                </option>
              ))}
            </NativeSelect>
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
                Add
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t border-ink/5 p-1">
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add event
            </Button>
          </div>
        ))}
    </div>
  );
}
