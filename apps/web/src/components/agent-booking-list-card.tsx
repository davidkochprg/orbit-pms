import type { AgentBookingRow } from '@orbit/shared';
import { LogIn, LogOut, Search } from 'lucide-react';
import { useState } from 'react';
import { AgentCard, AgentCardHeader } from '@/components/agent-card';
import { BookingRow } from '@/components/agent-mention';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

export type BookingListKind = 'arrivals' | 'departures' | 'search';

/** How many bookings show before "Show all". */
const ROWS = 5;

const icons = { arrivals: LogIn, departures: LogOut, search: Search };

/**
 * The bookings a tool listed, as rows that open the booking, for an answer that didn't list them
 * itself.
 */
export function BookingListCard({
  kind,
  rows,
}: {
  kind: BookingListKind;
  rows: AgentBookingRow[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, ROWS);
  const first = rows[0]!;
  const title =
    kind === 'arrivals'
      ? `Arriving ${formatDate(first.checkIn)}`
      : kind === 'departures'
        ? `Leaving ${formatDate(first.checkOut)}`
        : 'Bookings found';
  return (
    <AgentCard>
      <AgentCardHeader
        icon={icons[kind]}
        title={title}
        aside={<span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>}
      />
      <div className="-mx-1.5 flex flex-col">
        {shown.map((r) => (
          <BookingRow key={r.bookingId} id={r.bookingId} />
        ))}
      </div>
      {rows.length > ROWS && (
        <Button variant="ghost" size="xs" className="self-start" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      )}
    </AgentCard>
  );
}
