import type { ArrivalRisk } from '@orbit/shared';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Arrivals of the next week most likely not to come, from how they booked and the guest's own
 * history. Opens the booking on click.
 */
export function ArrivalRisks({ risks }: { risks: ArrivalRisk[] }) {
  const drawer = useBookingDrawer();
  if (risks.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-subtle-foreground">
        No no-show risks this week
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {risks.map((r) => (
        <li key={r.bookingId} className="border-b border-ink/5 last:border-b-0">
          <button
            type="button"
            onClick={() => drawer.open(r.bookingId)}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-surface-raised"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.8125rem]">
                {r.guestName}
                <span className="text-muted-foreground"> · Room {r.roomName}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {formatDate(r.checkIn)} · {r.reasons.join(', ')}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 rounded-[5px] px-1.5 font-mono text-[0.6875rem] leading-5',
                r.chance >= 0.2 ? 'bg-warning/15 text-warning' : 'bg-ink/5 text-muted-foreground',
              )}
            >
              {Math.round(r.chance * 100)}%
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
