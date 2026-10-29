import type { StayGuestView } from '@orbit/shared';
import { CircleCheck, CircleDashed, IdCard, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { AgentCard, AgentCardHeader } from '@/components/agent-card';
import { Mention } from '@/components/agent-mention';
import { GuestAvatar } from '@/components/guest-avatar';
import { IdScanDialog } from '@/components/id-scan-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGuestBook } from '@/lib/api';
import { missingSummary } from '@/lib/registration';

/**
 * A booking's guest book as it is now, one row per person, with a scan button for everyone still
 * missing details, and for people not added yet where the region records everyone. It reads the
 * guest book live, so a saved scan ticks its row off.
 */
export function GuestBookCard({ bookingId }: { bookingId: string }) {
  const book = useGuestBook(bookingId);
  // `undefined` = closed, `null` = scanning for a companion not added yet.
  const [scanning, setScanning] = useState<StayGuestView | null | undefined>(undefined);
  if (!book.data) {
    return book.isError ? null : <Skeleton className="h-24 rounded-stage" />;
  }
  const { guests, partySize, missing } = book.data;
  // People nobody has added yet count as missing only where the region records everyone.
  const incomplete = guests.filter((g) => g.missing.length > 0).length;
  const notAdded = missing > incomplete ? Math.max(0, partySize - guests.length) : 0;
  return (
    <AgentCard>
      <AgentCardHeader
        icon={IdCard}
        title={
          <>
            Guest book <Mention id={bookingId} />
          </>
        }
        aside={
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {missing === 0 ? 'Complete' : `${missing} still needed`}
          </span>
        }
      />
      <ul className="flex flex-col gap-1">
        {guests.map((g) => {
          const needs = missingSummary(g.missing);
          return (
            <li key={g.id} className="flex min-h-8 items-center gap-2.5">
              <GuestAvatar name={g.name} className="size-6 text-[9px]" />
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              {needs ? (
                <>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-warning">
                    <CircleDashed className="size-3.5 shrink-0" />
                    <span className="truncate">{needs}</span>
                  </span>
                  <ScanButton onClick={() => setScanning(g)} />
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-success">
                  <CircleCheck className="size-3.5 shrink-0" /> In the guest book
                </span>
              )}
            </li>
          );
        })}
        {Array.from({ length: notAdded }, (_, i) => (
          <li key={`open-${i}`} className="flex min-h-8 items-center gap-2.5">
            <span className="size-6 shrink-0 rounded-full border border-dashed border-border-strong" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              Guest {guests.length + i + 1} of {partySize}, not added yet
            </span>
            <ScanButton onClick={() => setScanning(null)} />
          </li>
        ))}
      </ul>
      <IdScanDialog
        bookingId={bookingId}
        stayGuest={scanning ?? null}
        open={scanning !== undefined}
        onOpenChange={(o) => !o && setScanning(undefined)}
      />
    </AgentCard>
  );
}

function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="xs" onClick={onClick}>
      <ScanLine /> Scan ID
    </Button>
  );
}
