import { Check, CircleAlert, X } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { usePendingAction, useResolvePendingAction } from '@/lib/api';
import { cn } from '@/lib/utils';

const outcome = {
  confirmed: { icon: Check, text: 'Done', className: 'text-success' },
  rejected: { icon: X, text: 'Rejected', className: 'text-muted-foreground' },
  failed: { icon: CircleAlert, text: 'Could not be applied', className: 'text-destructive' },
} as const;

/** Confirm card for a change the agent proposed. Nothing happens until the user confirms. */
export function PendingActionCard({ id, summary }: { id: string; summary: string }) {
  const action = usePendingAction(id);
  const resolve = useResolvePendingAction(id);
  const { open } = useBookingDrawer();
  const current = resolve.data ?? action.data;
  const result = current && current.status !== 'pending' ? outcome[current.status] : null;

  return (
    <div className="relative flex flex-col gap-2.5 rounded-control fill-panel p-3.5 shadow-[0_1px_2px_var(--shadow-soft),0_10px_30px_-18px_var(--shadow-deep)] stroke-lit">
      <p className="text-sm">{current?.summary ?? summary}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {current?.status === 'pending' && (
          <>
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('confirm')}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('reject')}
            >
              Reject
            </Button>
          </>
        )}
        {result && current && (
          <span className={cn('flex items-center gap-1 text-xs font-medium', result.className)}>
            <result.icon className="size-3.5" />
            {result.text}
            {current.error && `: ${current.error}`}
          </span>
        )}
        {!current && <span className="text-xs text-muted-foreground">Loading…</span>}
        {current?.bookingId && current.status === 'confirmed' && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => open(current.bookingId!)}
          >
            Open booking
          </Button>
        )}
        {current?.kind === 'update_guest' && current.status === 'confirmed' && (
          <Button size="sm" variant="ghost" className="ml-auto" asChild>
            <Link to={`/guests/${encodeURIComponent(current.input.guestId)}`}>Open profile</Link>
          </Button>
        )}
      </div>
      {resolve.isError && <p className="text-xs text-destructive">{resolve.error.message}</p>}
    </div>
  );
}
