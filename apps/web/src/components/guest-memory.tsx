import type { GuestMemoryKind } from '@orbit/shared';
import { BedDouble, CalendarHeart, Footprints, HeartPulse, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Section } from '@/components/section';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { useGuestMemory, useHealth, useReadGuestMemory } from '@/lib/api';
import { formatRecent } from '@/lib/format';

const kinds: Record<GuestMemoryKind, { icon: LucideIcon; label: string }> = {
  preference: { icon: BedDouble, label: 'Preference' },
  occasion: { icon: CalendarHeart, label: 'Occasion' },
  care: { icon: HeartPulse, label: 'Care' },
  habit: { icon: Footprints, label: 'Habit' },
};

/**
 * What Orbit remembers about a guest from earlier stays, their profile notes and their messages.
 * When the history changed since it was last read, it is read again in the background; nothing
 * shows for a guest without a history.
 */
export function GuestMemorySection({ guestId }: { guestId: string }) {
  const memory = useGuestMemory(guestId);
  const read = useReadGuestMemory(guestId);
  const aiOn = useHealth().data?.ai.configured ?? false;
  const stale = memory.data ? !memory.data.current : false;
  const { mutate, isIdle } = read;

  useEffect(() => {
    if (aiOn && stale && isIdle) mutate();
  }, [aiOn, stale, isIdle, mutate]);

  const data = read.data ?? memory.data;
  if (!data?.hasHistory) return null;
  if (data.items.length === 0 && !read.isPending) return null;
  return (
    <Section
      title="From earlier stays"
      actions={
        data.pastStays > 0 && (
          <span className="text-xs text-subtle-foreground">
            {data.pastStays} {data.pastStays === 1 ? 'stay' : 'stays'}
            {data.readAt && ` · read ${formatRecent(data.readAt)}`}
          </span>
        )
      }
    >
      {data.items.length === 0 ? (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {data.items.map((item) => {
            const { icon: Icon, label } = kinds[item.kind];
            return (
              <li key={item.text} className="flex items-start gap-2.5">
                <Tip label={label}>
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-label={label}
                  />
                </Tip>
                <span>{item.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
